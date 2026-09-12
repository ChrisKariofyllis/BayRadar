import type { Prisma, SnipeStatus } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { isAuctionListing } from "@/lib/format-ui";
import { normalizeEbayItemId, scheduleSnipe } from "@/lib/sniper/gixen";
import { getGixenRuntimeConfig } from "@/services/config";

export const ACTIVE_SNIPE_STATUSES: SnipeStatus[] = ["PENDING", "SCHEDULED", "EXECUTING"];

export interface PublicSnipe {
  id: string;
  status: SnipeStatus;
  maxBid: number;
  provider: string;
  providerSnipeId: string | null;
  finalPrice: number | null;
  active: boolean;
}

export interface ArmSnipeResult {
  success: boolean;
  error?: string;
  snipeId?: string;
  snipe?: PublicSnipe;
}

export async function findSnipeListing(listingId: string) {
  const byId = await prisma.seenListing.findUnique({
    where: { id: listingId },
    include: { snipeTask: true, monitor: { select: { buyingType: true } } },
  });
  if (byId) return byId;

  return prisma.seenListing.findFirst({
    where: {
      itemId: listingId,
      status: "ACCEPTED",
    },
    orderBy: { createdAt: "desc" },
    include: { snipeTask: true, monitor: { select: { buyingType: true } } },
  });
}

export async function armListingSnipe(
  listingId: string,
  maxBid: number,
  options?: { endsAt?: string },
): Promise<ArmSnipeResult> {
  if (!Number.isFinite(maxBid) || maxBid <= 0) {
    return { success: false, error: "maxBid must be a positive number." };
  }

  const listing = await findSnipeListing(listingId);
  if (!listing) {
    return { success: false, error: "Listing not found" };
  }
  if (!isAuctionListing(listing)) {
    return { success: false, error: "Only auction listings can be sniped." };
  }

  const endsAt = resolveEndsAt(options?.endsAt, listing.endsAt);
  if (endsAt && endsAt.getTime() <= Date.now()) {
    return { success: false, error: "This auction has already ended." };
  }

  const config = await getGixenRuntimeConfig();
  if (!config.enabled) {
    return { success: false, error: "Gixen sniping is disabled. Enable it in Settings." };
  }
  if (!config.configured) {
    return { success: false, error: "Gixen username and password are not configured." };
  }

  const itemId = listing.itemId;
  const gixenItemId = normalizeEbayItemId(itemId);
  if (!gixenItemId) {
    return { success: false, error: "Could not derive a numeric eBay item ID for Gixen." };
  }

  const leadTimeSec = 6;
  const executeAt = endsAt ? new Date(endsAt.getTime() - leadTimeSec * 1000) : new Date();
  const result = await scheduleSnipe(itemId, maxBid);
  const status: SnipeStatus = result.success ? "SCHEDULED" : "FAILED";
  const executionLog = result.success
    ? `Gixen accepted snipe ${result.snipeId ?? gixenItemId}`
    : result.error ?? "Gixen rejected the snipe.";

  const task = await persistSnipeTask({
    listing,
    maxBid,
    executeAt,
    leadTimeSec,
    status,
    executionLog,
    providerSnipeId: result.snipeId ?? (result.success ? gixenItemId : null),
  });

  return {
    success: result.success,
    snipeId: result.snipeId,
    error: result.error,
    snipe: toPublicSnipe(task),
  };
}

export function toPublicSnipe(task: {
  id: string;
  status: SnipeStatus;
  maxBid: number;
  provider: string;
  providerSnipeId: string | null;
  finalPrice?: number | null;
}): PublicSnipe {
  return {
    id: task.id,
    status: task.status,
    maxBid: task.maxBid,
    provider: task.provider,
    providerSnipeId: task.providerSnipeId,
    finalPrice: task.finalPrice ?? null,
    active: ACTIVE_SNIPE_STATUSES.includes(task.status),
  };
}

function resolveEndsAt(requested?: string, stored?: Date | null): Date | null {
  if (requested?.trim()) {
    const parsed = new Date(requested);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return stored ?? null;
}

async function persistSnipeTask(input: {
  listing: {
    id: string;
    itemId: string;
    monitorId: string;
    currency: string;
    snipeTask: { id: string } | null;
  };
  maxBid: number;
  executeAt: Date;
  leadTimeSec: number;
  status: SnipeStatus;
  executionLog: string;
  providerSnipeId: string | null;
}) {
  const data: Prisma.SnipeTaskUncheckedCreateInput = {
    itemId: input.listing.itemId,
    seenListingId: input.listing.id,
    monitorId: input.listing.monitorId,
    maxBid: input.maxBid,
    currency: input.listing.currency,
    leadTimeSec: input.leadTimeSec,
    provider: "GIXEN",
    providerSnipeId: input.providerSnipeId,
    status: input.status,
    executionLog: input.executionLog,
    executeAt: input.executeAt,
  };

  if (input.listing.snipeTask) {
    return prisma.snipeTask.update({
      where: { id: input.listing.snipeTask.id },
      data,
    });
  }

  return prisma.snipeTask.create({ data });
}
