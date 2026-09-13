const MINUTE_MS = 60_000;
const DEFAULT_INTERVAL_MS = 5 * MINUTE_MS;

const SCHEDULE_INTERVALS: Record<string, number> = {
  "every 1 minute": MINUTE_MS,
  "1m": MINUTE_MS,
  "* * * * *": MINUTE_MS,
  "*/1 * * * *": MINUTE_MS,

  "every 5 minutes": 5 * MINUTE_MS,
  "5m": 5 * MINUTE_MS,
  "*/5 * * * *": 5 * MINUTE_MS,

  "every 15 minutes": 15 * MINUTE_MS,
  "15m": 15 * MINUTE_MS,
  "*/15 * * * *": 15 * MINUTE_MS,

  "every 30 minutes": 30 * MINUTE_MS,
  "30m": 30 * MINUTE_MS,
  "*/30 * * * *": 30 * MINUTE_MS,

  "every 1 hour": 60 * MINUTE_MS,
  "every hour": 60 * MINUTE_MS,
  "1h": 60 * MINUTE_MS,
  "0 * * * *": 60 * MINUTE_MS,
};

export interface MonitorScheduleInput {
  lastRunAt: Date | string | null | undefined;
  cronSchedule?: string | null;
}

/** Resolve a monitor schedule string (cron, label, or shorthand) to an interval in ms. */
export function scheduleIntervalMs(schedule: string | null | undefined): number {
  const raw = (schedule ?? "").trim().toLowerCase();
  if (!raw) return DEFAULT_INTERVAL_MS;

  const mapped = SCHEDULE_INTERVALS[raw];
  if (mapped != null) return mapped;

  const starSlash = raw.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (starSlash) {
    const minutes = Number(starSlash[1]);
    if (Number.isFinite(minutes) && minutes > 0) return minutes * MINUTE_MS;
  }

  if (/^0\s+\*\s+\*\s+\*\s+\*$/.test(raw)) return 60 * MINUTE_MS;

  return DEFAULT_INTERVAL_MS;
}

/** True when a monitor has never run or its interval has elapsed since lastRunAt. */
export function isMonitorDue(monitor: MonitorScheduleInput, now = Date.now()): boolean {
  if (!monitor.lastRunAt) return true;

  const lastRunTimestamp = new Date(monitor.lastRunAt).getTime();
  if (!Number.isFinite(lastRunTimestamp)) return true;

  return now - lastRunTimestamp >= scheduleIntervalMs(monitor.cronSchedule);
}
