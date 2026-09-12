import { Prisma } from "@prisma/client";
import type { Monitor } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { verifyListingsBatch, type BatchItemCandidate } from "@/lib/ai/gatekeeper";
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
  incrementScanInspectedBy,
  markScanAiBatch,
  markScanFetching,
  markScanQuotaExhausted,
  recordAiVerdict,
} from "@/services/engine/scan-progress";
import { dispatchDealNotification } from "@/services/notifications";

export const MANUAL_SEARCH_LIMIT = 100;
export const BACKGROUND_SEARCH_LIMIT = 50;

export interface PollCycleOptions {
  cronSchedule?: string;
  reset?: boolean;
  monitorId?: string;
  searchLimit?: number;
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

    const searchLimit = resolveSearchLimit(options);

    for (const monitor of monitors) {
      try {
        newDealsFound += await pollMonitor(monitor, searchLimit);
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

async function pollMonitor(monitor: Monitor, searchLimit: number): Promise<number> {
  markScanFetching(monitor.name);
  const search = await ebayClient.searchItems({
    query: monitor.query,
    categoryId: monitor.categoryId,
    minPrice: monitor.minPrice ?? undefined,
    maxPrice: monitor.maxPrice,
    buyingType: monitor.buyingType,
    sort: monitor.buyingType === "AUCTION" ? "endingSoonest" : "newlyListed",
    limit: searchLimit,
  });

  const items = search.itemSummaries ?? [];
  console.log(
    `[ebay] Query "${monitor.query}" returned ${items.length} raw listings from eBay API (limit=${searchLimit})`,
  );
  if (items.length === 0) {
    console.log(`[ebay] ⚠️ 0 listings returned by eBay API. Consider broadening query terms.`);
  }
  addScanListings(items.length);

  const candidates: EbayItemSummary[] = [];

  for (const item of items) {
    if (!item.itemId || !item.title) {
      incrementScanInspected({ ai: monitor.aiVerify });
      continue;
    }

    const local = evaluateListing(item, monitor);
    const dealPrice = listingEffectivePrice(item);
    const belowMin = Boolean(monitor.minPrice && dealPrice != null && dealPrice < monitor.minPrice);
    if (!local.passed || belowMin) {
      const reason = belowMin
        ? `price ${dealPrice} is below minPrice ${monitor.minPrice}`
        : (local.reasons[0] ?? "local_filter");
      await persistSeenListing(monitor, item, {
        status: "REJECTED",
        aiVerified: false,
        aiVerificationReason: reason.slice(0, 80),
        notify: false,
      });
      incrementScanInspected({ ai: monitor.aiVerify });
      continue;
    }
    candidates.push(item);
  }

  const unseen = await rejectAlreadySeen(monitor.id, candidates);
  incrementScanInspectedBy(candidates.length - unseen.length, { ai: monitor.aiVerify });

  let newDeals = 0;
  let passedAi = 0;

  if (monitor.aiVerify) {
    if (unseen.length === 0) {
      console.log(`[ai-gatekeeper] 0 new candidates for "${monitor.name}", skipping Gemini`);
    } else {
      const marketplaceId = (await getEbayRuntimeConfig()).marketplaceId;
      const batchItems: BatchItemCandidate[] = unseen.map((item) => ({
        id: item.itemId,
        title: item.title,
        price: listingEffectivePrice(item) ?? 0,
        currency: item.currentBidPrice?.currency ?? item.price?.currency ?? "EUR",
      }));

      const aiResults = await verifyListingsBatch(monitor.query, marketplaceId, batchItems, (chunkIndex, chunkCount) => {
        markScanAiBatch(chunkIndex, chunkCount);
      });

      for (const item of unseen) {
        const gate = aiResults.get(item.itemId);
        if (gate?.errorType === "RATE_LIMIT" || gate?.reason === "QUOTA_EXHAUSTED") {
          markScanQuotaExhausted();
          const created = await persistSeenListing(monitor, item, {
            status: "ACCEPTED",
            aiVerified: false,
            aiVerificationReason: "basic_filter_fallback",
            notify: true,
          });
          if (created) newDeals += 1;
          incrementScanInspected({ ai: true, newDeal: created });
          continue;
        }
        if (gate?.isGenuine === true) {
          const created = await persistSeenListing(monitor, item, {
            status: "ACCEPTED",
            aiVerified: true,
            aiVerificationReason: gate.reason,
            notify: true,
          });
          if (created) newDeals += 1;
          passedAi += 1;
          recordAiVerdict(true);
          incrementScanInspected({ ai: true, newDeal: created });
        } else {
          const reason = gate?.reason ?? "ai_batch_error";
          await persistSeenListing(monitor, item, {
            status: "REJECTED",
            aiVerified: false,
            aiVerificationReason: reason,
            notify: false,
          });
          recordAiVerdict(false);
          console.log(`[ai-gatekeeper] ❌ REJECTED: "${item.title}" | Reason: ${reason}`);
          incrementScanInspected({ ai: true });
        }
      }
    }
  } else {
    for (const item of unseen) {
      const created = await persistSeenListing(monitor, item, {
        status: "ACCEPTED",
        notify: true,
      });
      if (created) newDeals += 1;
      incrementScanInspected({ newDeal: created });
    }
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

async function rejectAlreadySeen(monitorId: string, candidates: EbayItemSummary[]): Promise<EbayItemSummary[]> {
  if (candidates.length === 0) return [];

  const existing = await prisma.seenListing.findMany({
    where: {
      monitorId,
      itemId: { in: candidates.map((item) => item.itemId) },
    },
    select: { itemId: true },
  });
  const seenIds = new Set(existing.map((row) => row.itemId));
  return candidates.filter((item) => !seenIds.has(item.itemId));
}

function resolveSearchLimit(options: PollCycleOptions): number {
  if (typeof options.searchLimit === "number" && Number.isFinite(options.searchLimit)) {
    return Math.max(1, Math.floor(options.searchLimit));
  }
  if (options.reset || options.monitorId) return MANUAL_SEARCH_LIMIT;
  return BACKGROUND_SEARCH_LIMIT;
}

async function persistSeenListing(
  monitor: Monitor,
  item: EbayItemSummary,
  options?: {
    status?: "ACCEPTED" | "REJECTED";
    aiVerified?: boolean;
    aiVerificationReason?: string | null;
    notify?: boolean;
  },
): Promise<boolean> {
  const existing = await prisma.seenListing.findUnique({
    where: {
      itemId_monitorId: {
        itemId: item.itemId,
        monitorId: monitor.id,
      },
    },
    select: { id: true },
  });

  if (existing) return false;

  const record = {
    ...toSeenListingInput(monitor.id, item),
    status: options?.status ?? "ACCEPTED",
    aiVerified: options?.aiVerified ?? false,
    aiVerificationReason: options?.aiVerificationReason ?? null,
  };

  try {
    const created = await prisma.seenListing.create({ data: record });

    if (options?.notify !== false && record.status === "ACCEPTED") {
      try {
        await dispatchDealNotification({
          itemId: item.itemId,
          listingId: created.id,
          title: item.title,
          price: record.price,
          currency: record.currency,
          buyingFormat: record.buyingFormat,
          buyingType: monitor.buyingType,
          itemUrl: record.itemUrl,
          imageUrl: record.imageUrl,
          bidCount: record.bidCount,
          endsAt: record.endsAt,
          monitorName: monitor.name,
          maxPrice: monitor.maxPrice,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[poller] Notification failed for ${item.itemId}: ${message}`);
      }
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }

  return true;
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
    itemUrl: item.itemWebUrl || `https://www.ebay.com/itm/${item.itemId}`,
    imageUrl: item.image?.imageUrl ?? null,
    sellerFeedback: Number.isFinite(feedback) ? feedback : null,
    ...extractShipping(item),
    endsAt: item.itemEndDate ? new Date(item.itemEndDate) : null,
  };
}

function extractShipping(item: EbayItemSummary): { shippingCost: number | null; shippingCurrency: string | null } {
  const option = item.shippingOptions?.[0];
  const raw = option?.shippingCost?.value;
  const value = raw != null && raw !== "" ? Number.parseFloat(raw) : Number.NaN;
  if (Number.isFinite(value)) {
    return { shippingCost: value, shippingCurrency: option?.shippingCost?.currency ?? item.price?.currency ?? "EUR" };
  }
  if (option?.shippingCostType?.toUpperCase() === "FREE") {
    return { shippingCost: 0, shippingCurrency: item.price?.currency ?? "EUR" };
  }
  return { shippingCost: null, shippingCurrency: null };
}
