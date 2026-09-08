import { Prisma } from "@prisma/client";
import type { Monitor } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { verifyListingWithAi } from "@/lib/ai/gatekeeper";
import { getEbayRuntimeConfig } from "@/services/config";
import { ebayClient } from "@/services/ebay/client";
import type { EbayItemSummary } from "@/services/ebay/types";
import { evaluateListing, listingEffectivePrice } from "@/services/filter";
import {
  addScanListings,
  beginScanProgress,
  failScanProgress,
  finishScanProgress,
  getScanProgress,
  incrementScanInspected,
  markScanFetching,
  recordAiVerdict,
} from "@/services/engine/scan-progress";
import { dispatchDealNotification } from "@/services/notifications";

export interface PollCycleOptions {
  cronSchedule?: string;
  reset?: boolean;
  monitorId?: string;
}

export interface PollCycleError {
  monitorId?: string;
  monitorName?: string;
  message: string;
}

export interface PollCycleSummary {
  totalMonitors: number;
  newDealsFound: number;
  errors: PollCycleError[];
}

let cycleTail: Promise<void> = Promise.resolve();

export function executePollCycle(options: PollCycleOptions = {}): Promise<PollCycleSummary> {
  const run = cycleTail.then(() => runPollCycle(options));
  cycleTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function runPollCycle(options: PollCycleOptions): Promise<PollCycleSummary> {
  const startedAt = Date.now();
  const errors: PollCycleError[] = [];
  let newDealsFound = 0;

  try {
    const monitors = await prisma.monitor.findMany({
      where: {
        isActive: true,
        ...(options.monitorId ? { id: options.monitorId } : {}),
        ...(options.cronSchedule && !options.monitorId ? { cronSchedule: options.cronSchedule } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    beginScanProgress({ aiEnabled: monitors.some((monitor) => monitor.aiVerify) });

    if (options.reset && monitors.length > 0) {
      const cleared = await prisma.seenListing.deleteMany({
        where: { monitorId: { in: monitors.map((monitor) => monitor.id) } },
      });
      console.log(`[poller] Reset cleared ${cleared.count} seen listing(s) before rescan`);
    }

    for (const monitor of monitors) {
      try {
        newDealsFound += await pollMonitor(monitor);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[poller] Monitor "${monitor.name}" (${monitor.id}) failed: ${message}`);
        errors.push({ monitorId: monitor.id, monitorName: monitor.name, message });
      }
    }

    const summary: PollCycleSummary = {
      totalMonitors: monitors.length,
      newDealsFound,
      errors,
    };

    finishScanProgress({ newDealsFound });
    const progress = getScanProgress();

    console.log(
      `[poller] Cycle complete in ${Date.now() - startedAt}ms` +
        `${options.cronSchedule ? ` (schedule=${options.cronSchedule})` : ""}: ` +
        `${summary.totalMonitors} monitors, ${progress.fetchedFromEbay} from eBay, ` +
        `${progress.passedAi} passed AI, ${summary.newDealsFound} new deals, ${summary.errors.length} errors`,
    );

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failScanProgress(message);
    throw error;
  }
}

async function pollMonitor(monitor: Monitor): Promise<number> {
  markScanFetching(monitor.name);
  const search = await ebayClient.searchItems({
    query: monitor.query,
    categoryId: monitor.categoryId,
    minPrice: monitor.minPrice ?? undefined,
    maxPrice: monitor.maxPrice,
    buyingType: monitor.buyingType,
    sort: monitor.buyingType === "AUCTION" ? "endingSoonest" : "newlyListed",
  });

  const items = search.itemSummaries ?? [];
  console.log(`[ebay] Query "${monitor.query}" returned ${items.length} raw listings from eBay API`);
  if (items.length === 0) {
    console.log(`[ebay] ⚠️ 0 listings returned by eBay API. Consider broadening query terms.`);
  }
  addScanListings(items.length);
  let newDeals = 0;
  let passedAi = 0;
  const marketplaceId = (await getEbayRuntimeConfig()).marketplaceId;

  for (const item of items) {
    if (!item.itemId || !item.title) {
      incrementScanInspected({ ai: monitor.aiVerify });
      continue;
    }

    const verdict = evaluateListing(item, monitor);
    if (!verdict.passed) {
      incrementScanInspected({ ai: monitor.aiVerify });
      continue;
    }

    const dealPrice = listingEffectivePrice(item);
    if (monitor.minPrice && dealPrice != null && dealPrice < monitor.minPrice) {
      incrementScanInspected({ ai: monitor.aiVerify });
      continue;
    }

    const result = await persistNewDeal(monitor, item, marketplaceId);
    if (result.created) newDeals += 1;
    if (result.aiOutcome === "passed") passedAi += 1;
    incrementScanInspected({ ai: monitor.aiVerify, newDeal: result.created });
  }

  console.log(
    `[poller] "${monitor.name}": ${items.length} fetched from eBay` +
      `${monitor.aiVerify ? `, ${passedAi} passed AI` : ""}` +
      `, ${newDeals} saved`,
  );

  await prisma.monitor.update({
    where: { id: monitor.id },
    data: { lastRunAt: new Date() },
  });

  return newDeals;
}

async function persistNewDeal(
  monitor: Monitor,
  item: EbayItemSummary,
  marketplaceId: string,
): Promise<{ created: boolean; aiOutcome: "none" | "passed" | "rejected" }> {
  const existing = await prisma.seenListing.findUnique({
    where: {
      itemId_monitorId: {
        itemId: item.itemId,
        monitorId: monitor.id,
      },
    },
    select: { id: true },
  });

  if (existing) return { created: false, aiOutcome: "none" };

  let aiVerified = false;
  let aiVerificationReason: string | null = null;

  if (monitor.aiVerify) {
    const price = listingEffectivePrice(item) ?? 0;
    const currency = item.currentBidPrice?.currency ?? item.price?.currency ?? "EUR";
    const gate = await verifyListingWithAi({
      targetQuery: monitor.query,
      title: item.title,
      price,
      currency,
      marketplaceId,
      buyingFormat: item.buyingOptions?.join(",") || "UNKNOWN",
    });

    if (gate.isGenuine !== true) {
      recordAiVerdict(false);
      console.log(`[ai-gatekeeper] ❌ Dropped junk listing: "${item.title}" | Reason: ${gate.reason}`);
      return { created: false, aiOutcome: "rejected" };
    }

    recordAiVerdict(true);
    aiVerified = true;
    aiVerificationReason = gate.reason;
  }

  const record = {
    ...toSeenListingInput(monitor.id, item),
    aiVerified,
    aiVerificationReason,
  };

  try {
    await prisma.seenListing.create({ data: record });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { created: false, aiOutcome: monitor.aiVerify ? "passed" : "none" };
    }
    throw error;
  }

  try {
    await dispatchDealNotification({
      itemId: item.itemId,
      title: item.title,
      price: record.price,
      currency: record.currency,
      buyingFormat: record.buyingFormat,
      itemUrl: record.itemUrl,
      imageUrl: record.imageUrl,
      bidCount: record.bidCount,
      endsAt: record.endsAt,
      monitorName: monitor.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[poller] Notification failed for ${item.itemId}: ${message}`);
  }

  return { created: true, aiOutcome: monitor.aiVerify ? "passed" : "none" };
}

export async function clearSeenListings(monitorId?: string): Promise<number> {
  const result = await prisma.seenListing.deleteMany(monitorId ? { where: { monitorId } } : undefined);
  return result.count;
}

function toSeenListingInput(monitorId: string, item: EbayItemSummary) {
  const price = listingEffectivePrice(item) ?? 0;
  const currency = item.currentBidPrice?.currency ?? item.price?.currency ?? "EUR";
  const feedbackRaw = item.seller?.feedbackPercentage;
  const feedback = feedbackRaw != null ? Number.parseFloat(feedbackRaw) : Number.NaN;

  return {
    itemId: item.itemId,
    monitorId,
    title: item.title,
    price,
    currency,
    buyingFormat: item.buyingOptions?.join(",") || "UNKNOWN",
    bidCount: item.bidCount ?? 0,
    itemUrl: item.itemWebUrl,
    imageUrl: item.image?.imageUrl ?? null,
    sellerFeedback: Number.isFinite(feedback) ? feedback : null,
    endsAt: item.itemEndDate ? new Date(item.itemEndDate) : null,
  };
}
