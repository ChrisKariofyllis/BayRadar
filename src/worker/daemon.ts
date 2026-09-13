import "dotenv/config";

import { prisma } from "@/db/prisma";
import { isMonitorDue, scheduleIntervalMs } from "@/lib/schedule";
import { syncEndedSnipeOutcomes } from "@/lib/sniper/sync-outcomes";
import { BACKGROUND_SEARCH_LIMIT, executePollCycle } from "@/services/engine/poller";
import { startTelegramBotLoop } from "@/worker/telegram-bot";

const MINUTE_MS = 60_000;
const SCHEDULER_TICK_MS = 30_000;
const MONITOR_TIMEOUT_MS = 20_000;
const HEARTBEAT_EVERY = 4;
const SNIPE_SYNC_EVERY = 10;

let shuttingDown = false;
let tickCount = 0;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
const runningMonitors = new Set<string>();
const shutdownAbort = new AbortController();

async function main(): Promise<void> {
  console.log(`[daemon] BayRadar worker starting (scheduler tick=${SCHEDULER_TICK_MS}ms)`);

  void startTelegramBotLoop(shutdownAbort.signal).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[daemon] Telegram bot loop crashed: ${message}`);
  });

  process.once("SIGINT", () => void handleShutdown("SIGINT"));
  process.once("SIGTERM", () => void handleShutdown("SIGTERM"));

  const boot = await executePollCycle();
  console.log("[daemon] Startup poll complete", formatSummary(boot));
  await runSnipeOutcomeSync("startup");

  console.log("[daemon] Starting resilient scheduler loop. Press Ctrl+C to stop.");
  schedulerLoop();
}

function schedulerLoop(): void {
  if (shuttingDown) return;

  void (async () => {
    try {
      await checkAndRunDueMonitors();
    } catch (err) {
      console.error("[SchedulerError] Unexpected error in loop:", err);
    } finally {
      if (!shuttingDown) {
        schedulerTimer = setTimeout(schedulerLoop, SCHEDULER_TICK_MS);
      }
    }
  })();
}

async function checkAndRunDueMonitors(): Promise<void> {
  tickCount += 1;
  const nowIso = new Date().toISOString();

  if (tickCount === 1 || tickCount % HEARTBEAT_EVERY === 0) {
    console.log(`[SchedulerHeartbeat] Checking monitors at ${nowIso}`);
  }

  const monitors = await prisma.monitor.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      cronSchedule: true,
      lastRunAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const due = monitors.filter((monitor) => isMonitorDue(monitor));
  if (due.length > 0) {
    console.log(
      `[Scheduler] ${due.length} due monitor(s) at ${nowIso}: ${due.map((monitor) => monitor.name).join(", ")}`,
    );
  }

  for (const monitor of due) {
    if (shuttingDown) break;
    if (runningMonitors.has(monitor.id)) {
      console.log(`[Scheduler] Skipping "${monitor.name}" — still running from a previous tick`);
      continue;
    }

    runningMonitors.add(monitor.id);
    try {
      // Claim the slot before the scan so a slow poll cannot be double-scheduled.
      await prisma.monitor.update({
        where: { id: monitor.id },
        data: { lastRunAt: new Date() },
      });

      const intervalLabel = formatInterval(scheduleIntervalMs(monitor.cronSchedule));
      console.log(`[Scheduler] Running "${monitor.name}" (every ${intervalLabel})`);

      const summary = await runMonitorWithTimeout(monitor.id, monitor.name);
      console.log(`[Scheduler] Finished "${monitor.name}"`, formatSummary(summary));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Scheduler] Monitor "${monitor.name}" (${monitor.id}) failed: ${message}`);
    } finally {
      runningMonitors.delete(monitor.id);
    }
  }

  if (tickCount === 1 || tickCount % SNIPE_SYNC_EVERY === 0) {
    await runSnipeOutcomeSync(`tick-${tickCount}`);
  }
}

async function runMonitorWithTimeout(
  monitorId: string,
  monitorName: string,
): Promise<{ totalMonitors: number; newDealsFound: number; errors: unknown[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MONITOR_TIMEOUT_MS);
  const work = executePollCycle({
    monitorId,
    searchLimit: BACKGROUND_SEARCH_LIMIT,
  });
  void work.catch((error) => {
    if (controller.signal.aborted) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Scheduler] "${monitorName}" finished after timeout with error: ${message}`);
    }
  });

  try {
    return await Promise.race([
      work,
      abortAfter(controller.signal, `Monitor "${monitorName}" timed out after ${MONITOR_TIMEOUT_MS}ms`),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function abortAfter(signal: AbortSignal, message: string): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new Error(message));
      return;
    }
    signal.addEventListener(
      "abort",
      () => {
        reject(new Error(message));
      },
      { once: true },
    );
  });
}

async function handleShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdownAbort.abort();
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  console.log(`[daemon] ${signal} received, shutting down gracefully…`);

  try {
    await prisma.$disconnect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[daemon] Prisma disconnect error: ${message}`);
  }

  process.exit(0);
}

async function runSnipeOutcomeSync(label: string): Promise<void> {
  try {
    const result = await syncEndedSnipeOutcomes();
    if (result.checked === 0) return;
    console.log(
      `[daemon] Snipe outcome sync (${label}) checked=${result.checked} updated=${result.updated} won=${result.won} outbid=${result.outbid} failed=${result.failed} skipped=${result.skipped}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[daemon] Snipe outcome sync failed: ${message}`);
  }
}

function formatSummary(summary: { totalMonitors: number; newDealsFound: number; errors: unknown[] }): string {
  return `monitors=${summary.totalMonitors} newDeals=${summary.newDealsFound} errors=${summary.errors.length}`;
}

function formatInterval(ms: number): string {
  if (ms % (60 * MINUTE_MS) === 0) return `${ms / (60 * MINUTE_MS)}h`;
  if (ms % MINUTE_MS === 0) return `${ms / MINUTE_MS}m`;
  return `${ms}ms`;
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[daemon] Fatal error: ${message}`);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
