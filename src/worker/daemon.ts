import "dotenv/config";

import { schedule, shutdown, validate, type ScheduledTask } from "node-cron";

import { prisma } from "@/db/prisma";
import { syncEndedSnipeOutcomes } from "@/lib/sniper/sync-outcomes";
import { executePollCycle } from "@/services/engine/poller";
import { startTelegramBotLoop } from "@/worker/telegram-bot";

const DEFAULT_CRON = process.env.WORKER_DEFAULT_CRON?.trim() || "*/5 * * * *";
const RECONCILE_CRON = "*/5 * * * *";

const pollJobs = new Map<string, ScheduledTask>();
let shuttingDown = false;
const shutdownAbort = new AbortController();

async function main(): Promise<void> {
  console.log(`[daemon] BayRadar worker starting (default cron=${DEFAULT_CRON})`);

  void startTelegramBotLoop(shutdownAbort.signal).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[daemon] Telegram bot loop crashed: ${message}`);
  });

  await syncPollSchedules();
  schedule(RECONCILE_CRON, () => syncPollSchedules(), {
    name: "reconcile-schedules",
    noOverlap: true,
  });

  const boot = await executePollCycle();
  console.log("[daemon] Startup poll complete", formatSummary(boot));
  await runSnipeOutcomeSync("startup");

  process.once("SIGINT", () => void handleShutdown("SIGINT"));
  process.once("SIGTERM", () => void handleShutdown("SIGTERM"));

  console.log("[daemon] Listening for cron ticks. Press Ctrl+C to stop.");
}

async function syncPollSchedules(): Promise<void> {
  if (shuttingDown) return;

  const monitors = await prisma.monitor.findMany({
    where: { isActive: true },
    select: { cronSchedule: true },
  });

  const wanted = new Set<string>();
  for (const monitor of monitors) {
    const expression = monitor.cronSchedule?.trim() || DEFAULT_CRON;
    if (!validate(expression)) {
      console.warn(`[daemon] Ignoring invalid cron expression: ${expression}`);
      continue;
    }
    wanted.add(expression);
  }

  if (wanted.size === 0) {
    wanted.add(DEFAULT_CRON);
  }

  for (const expression of wanted) {
    if (pollJobs.has(expression)) continue;

    const task = schedule(
      expression,
      async () => {
        const summary = await executePollCycle({ cronSchedule: expression });
        console.log(`[daemon] Scheduled poll (${expression})`, formatSummary(summary));
        await runSnipeOutcomeSync(expression);
      },
      { name: `poll:${expression}`, noOverlap: true },
    );

    pollJobs.set(expression, task);
    console.log(`[daemon] Registered poll job ${expression} (next=${task.getNextRun()?.toISOString() ?? "n/a"})`);
  }

  for (const [expression, task] of pollJobs) {
    if (wanted.has(expression)) continue;
    await task.destroy();
    pollJobs.delete(expression);
    console.log(`[daemon] Removed unused poll job ${expression}`);
  }
}

async function handleShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdownAbort.abort();
  console.log(`[daemon] ${signal} received, shutting down gracefully…`);

  try {
    await shutdown(10_000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[daemon] Cron shutdown error: ${message}`);
  }

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

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[daemon] Fatal error: ${message}`);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
