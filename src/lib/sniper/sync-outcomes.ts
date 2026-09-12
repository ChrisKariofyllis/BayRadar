import type { SnipeStatus } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { normalizeEbayItemId, syncSnipeOutcomes } from "@/lib/sniper/gixen";
import { getGixenRuntimeConfig } from "@/services/config";

const SETTLE_AFTER_MS = 2 * 60 * 1000;
const MISSING_AFTER_MS = 30 * 60 * 1000;
const ACTIVE: SnipeStatus[] = ["PENDING", "SCHEDULED", "EXECUTING"];

export interface SnipeOutcomeSyncSummary {
  checked: number;
  updated: number;
  skipped: number;
  won: number;
  outbid: number;
  failed: number;
}

export async function syncEndedSnipeOutcomes(): Promise<SnipeOutcomeSyncSummary> {
  const summary: SnipeOutcomeSyncSummary = {
    checked: 0,
    updated: 0,
    skipped: 0,
    won: 0,
    outbid: 0,
    failed: 0,
  };

  const config = await getGixenRuntimeConfig();
  if (!config.enabled || !config.configured) {
    return summary;
  }

  const endedBefore = new Date(Date.now() - SETTLE_AFTER_MS);
  const due = await prisma.snipeTask.findMany({
    where: {
      status: { in: ACTIVE },
      OR: [
        { seenListing: { endsAt: { lte: endedBefore } } },
        { seenListing: { is: null }, executeAt: { lte: endedBefore } },
        { seenListing: { endsAt: null }, executeAt: { lte: endedBefore } },
      ],
    },
    include: {
      seenListing: { select: { endsAt: true, itemId: true } },
    },
  });

  if (due.length === 0) return summary;
  summary.checked = due.length;

  const itemIds = [...new Set(due.map((task) => normalizeEbayItemId(task.itemId)).filter(Boolean))];
  const outcomes = itemIds.length > 0 ? await syncSnipeOutcomes(itemIds) : {};

  for (const task of due) {
    const numericId = normalizeEbayItemId(task.itemId);
    const outcome = numericId ? outcomes[numericId] : undefined;
    const endedAt = task.seenListing?.endsAt ?? task.executeAt;
    const ageMs = Date.now() - endedAt.getTime();

    let nextStatus: SnipeStatus | null = outcome ? outcome.status : null;
    let finalPrice = outcome?.finalPrice ?? null;
    let log = outcome
      ? `Gixen outcome ${outcome.status}${outcome.rawStatus ? ` (${outcome.rawStatus})` : ""}`
      : null;

    if (!nextStatus && ageMs >= MISSING_AFTER_MS) {
      nextStatus = "FAILED";
      log = "No Gixen outcome after the auction ended; marked failed.";
    }

    if (!nextStatus) {
      summary.skipped += 1;
      continue;
    }

    await prisma.snipeTask.update({
      where: { id: task.id },
      data: {
        status: nextStatus,
        finalPrice,
        executionLog: log,
      },
    });

    summary.updated += 1;
    if (nextStatus === "WON") summary.won += 1;
    else if (nextStatus === "OUTBID") summary.outbid += 1;
    else if (nextStatus === "FAILED") summary.failed += 1;
  }

  return summary;
}
