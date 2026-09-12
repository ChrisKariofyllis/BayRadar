import type { Prisma, SnipeStatus } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { isAuctionListing } from "@/lib/format-ui";
import { cancelSnipeSchema, createSnipeSchema } from "@/lib/schemas/snipe";
import { cancelSnipe, normalizeEbayItemId, scheduleSnipe } from "@/lib/sniper/gixen";
import { getGixenRuntimeConfig } from "@/services/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ACTIVE_SNIPE_STATUSES: SnipeStatus[] = ["PENDING", "SCHEDULED", "EXECUTING"];

export async function POST(request: Request) {
  try {
    const parsed = createSnipeSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    const listing = await findListing(parsed.data.listingId);
    if (!listing) {
      return jsonError("Listing not found", 404);
    }
    if (!isAuctionListing(listing)) {
      return jsonError("Only auction listings can be sniped.", 400);
    }

    const endsAt = resolveEndsAt(parsed.data.endsAt, listing.endsAt);
    if (endsAt && endsAt.getTime() <= Date.now()) {
      return jsonError("This auction has already ended.", 400);
    }

    const config = await getGixenRuntimeConfig();
    if (!config.enabled) {
      return jsonError("Gixen sniping is disabled. Enable it in Settings.", 400);
    }
    if (!config.configured) {
      return jsonError("Gixen username and password are not configured.", 400);
    }

    const itemId = listing.itemId;
    const gixenItemId = normalizeEbayItemId(itemId);
    if (!gixenItemId) {
      return jsonError("Could not derive a numeric eBay item ID for Gixen.", 400);
    }

    const leadTimeSec = 6;
    const executeAt = endsAt ? new Date(endsAt.getTime() - leadTimeSec * 1000) : new Date();
    const result = await scheduleSnipe(itemId, parsed.data.maxBid);
    const status: SnipeStatus = result.success ? "SCHEDULED" : "FAILED";
    const executionLog = result.success
      ? `Gixen accepted snipe ${result.snipeId ?? gixenItemId}`
      : result.error ?? "Gixen rejected the snipe.";

    const task = await persistSnipeTask({
      listing,
      maxBid: parsed.data.maxBid,
      executeAt,
      leadTimeSec,
      status,
      executionLog,
      providerSnipeId: result.snipeId ?? (result.success ? gixenItemId : null),
    });

    return jsonOk({
      success: result.success,
      snipeId: result.snipeId,
      error: result.error,
      snipe: toPublicSnipe(task),
    });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/snipe] POST failed: ${message}`);
    return jsonError("Failed to schedule snipe", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const parsed = cancelSnipeSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    const listing = await findListing(parsed.data.listingId);
    if (!listing) {
      return jsonError("Listing not found", 404);
    }

    const task = listing.snipeTask;
    if (!task || !ACTIVE_SNIPE_STATUSES.includes(task.status)) {
      return jsonError("No active snipe is armed for this listing.", 400);
    }

    const config = await getGixenRuntimeConfig();
    if (!config.enabled) {
      return jsonError("Gixen sniping is disabled. Enable it in Settings.", 400);
    }
    if (!config.configured) {
      return jsonError("Gixen username and password are not configured.", 400);
    }

    const result = await cancelSnipe(listing.itemId);
    if (!result.success) {
      return jsonOk({
        success: false,
        error: result.error || "Gixen did not remove the snipe.",
        snipe: toPublicSnipe(task),
      });
    }

    const cancelled = await prisma.snipeTask.update({
      where: { id: task.id },
      data: {
        status: "CANCELLED",
        executionLog: `Cancelled via Gixen${result.snipeId ? ` (${result.snipeId})` : ""}`,
      },
    });

    return jsonOk({
      success: true,
      snipe: toPublicSnipe(cancelled),
    });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/snipe] DELETE failed: ${message}`);
    return jsonError("Failed to cancel snipe", 500);
  }
}

async function findListing(listingId: string) {
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

function toPublicSnipe(task: {
  id: string;
  status: SnipeStatus;
  maxBid: number;
  provider: string;
  providerSnipeId: string | null;
}) {
  return {
    id: task.id,
    status: task.status,
    maxBid: task.maxBid,
    provider: task.provider,
    providerSnipeId: task.providerSnipeId,
    active: ACTIVE_SNIPE_STATUSES.includes(task.status),
  };
}
