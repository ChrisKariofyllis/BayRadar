import type { Prisma, SnipeStatus } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { jsonOk } from "@/lib/api";
import { auctionHasEnded, isActiveSnipe, toActiveSnipe } from "@/lib/format-ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const monitorId = searchParams.get("monitorId")?.trim() || undefined;
  const format = searchParams.get("format")?.trim().toUpperCase() || undefined;
  const q = searchParams.get("q")?.trim() || undefined;
  const snipes = searchParams.get("snipes")?.trim().toLowerCase() || undefined;
  const sort = parseSort(searchParams.get("sort"));
  const limit = clampLimit(Number(searchParams.get("limit") ?? 80));

  const where: Prisma.SeenListingWhereInput = { status: "ACCEPTED" };
  if (monitorId) where.monitorId = monitorId;
  if (q) where.title = { contains: q };
  if (format === "AUCTION" || format === "FIXED_PRICE") {
    where.buyingFormat = { contains: format };
  }
  if (snipes === "active") {
    where.snipeTask = { status: { in: ACTIVE_SNIPE_STATUSES } };
    where.OR = [{ endsAt: null }, { endsAt: { gt: new Date() } }];
  }
  if (snipes === "ended") {
    where.OR = [
      { snipeTask: { status: { in: ENDED_SNIPE_STATUSES } } },
      { endsAt: { lte: new Date() }, snipeTask: { status: { in: ACTIVE_SNIPE_STATUSES } } },
    ];
  }

  const listings = await prisma.seenListing.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      monitor: { select: { id: true, name: true, buyingType: true } },
      snipeTask: {
        select: {
          id: true,
          status: true,
          maxBid: true,
          provider: true,
          providerSnipeId: true,
          finalPrice: true,
        },
      },
    },
  });

  const [activeSnipeCount, endedSnipeCount] = await Promise.all([
    prisma.snipeTask.count({
      where: {
        status: { in: ACTIVE_SNIPE_STATUSES },
        seenListing: { status: "ACCEPTED", OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
      },
    }),
    prisma.snipeTask.count({
      where: {
        OR: [
          { status: { in: ENDED_SNIPE_STATUSES }, seenListing: { status: "ACCEPTED" } },
          {
            status: { in: ACTIVE_SNIPE_STATUSES },
            seenListing: { status: "ACCEPTED", endsAt: { lte: new Date() } },
          },
        ],
      },
    }),
  ]);

  return jsonOk({
    listings: sortListings(listings, sort).slice(0, limit).map(toFeedListing),
    activeSnipeCount,
    endedSnipeCount,
  });
}

export async function DELETE() {
  const deleted = await prisma.seenListing.deleteMany({});
  return jsonOk({ success: true, count: deleted.count });
}

const ACTIVE_SNIPE_STATUSES: SnipeStatus[] = ["PENDING", "SCHEDULED", "EXECUTING"];
const ENDED_SNIPE_STATUSES: SnipeStatus[] = ["WON", "SUCCESS", "OUTBID", "FAILED"];

function toFeedListing<T extends {
  endsAt?: Date | string | null;
  snipeTask?: {
    id: string;
    status: SnipeStatus;
    maxBid: number;
    provider: string;
    providerSnipeId?: string | null;
    finalPrice?: number | null;
  } | null;
}>(listing: T) {
  const task = listing.snipeTask ?? null;
  const ended = auctionHasEnded(listing.endsAt);
  const active = Boolean(task && isActiveSnipe(task.status) && !ended);
  return {
    ...listing,
    snipeTask: task ? { ...task, active } : null,
    activeSnipe: active ? toActiveSnipe({ ...task!, active: true }) : null,
    snipeOutcome: toSnipeOutcome(task, ended),
  };
}

function toSnipeOutcome(
  task: {
    id: string;
    status: SnipeStatus;
    maxBid: number;
    finalPrice?: number | null;
  } | null,
  ended: boolean,
) {
  if (!task) return null;
  if (task.status === "WON" || task.status === "SUCCESS") {
    return { id: task.id, status: "WON" as const, maxBid: task.maxBid, finalPrice: task.finalPrice ?? null };
  }
  if (task.status === "OUTBID" || task.status === "FAILED") {
    return { id: task.id, status: task.status, maxBid: task.maxBid, finalPrice: task.finalPrice ?? null };
  }
  if (ended && isActiveSnipe(task.status)) {
    return { id: task.id, status: "CHECKING" as const, maxBid: task.maxBid, finalPrice: null };
  }
  return null;
}

type FeedSort = "newest" | "oldest" | "price_asc" | "price_desc" | "ending_soon" | "ending_late";

function parseSort(value: string | null): FeedSort {
  switch (value?.trim()) {
    case "oldest":
    case "price_asc":
    case "price_desc":
    case "ending_soon":
    case "ending_late":
      return value.trim() as FeedSort;
    default:
      return "newest";
  }
}

type SortableListing = {
  createdAt: Date | string;
  price: number | string | null;
  endsAt?: Date | string | null;
  endTime?: Date | string | null;
};

function sortListings<T extends SortableListing>(listings: T[], sort: FeedSort): T[] {
  const ranked = listings.map((listing, index) => ({ listing, index }));
  ranked.sort((left, right) => {
    const comparison = compareListings(left.listing, right.listing, sort);
    return comparison !== 0 ? comparison : left.index - right.index;
  });
  return ranked.map((entry) => entry.listing);
}

function compareListings(left: SortableListing, right: SortableListing, sort: FeedSort): number {
  switch (sort) {
    case "oldest":
      return createdAtMs(left.createdAt) - createdAtMs(right.createdAt);
    case "price_asc":
      return numericPrice(left.price) - numericPrice(right.price);
    case "price_desc":
      return numericPrice(right.price) - numericPrice(left.price);
    case "ending_soon":
      return compareEndTimes(listingEndValue(left), listingEndValue(right), "asc");
    case "ending_late":
      return compareEndTimes(listingEndValue(left), listingEndValue(right), "desc");
    default:
      return createdAtMs(right.createdAt) - createdAtMs(left.createdAt);
  }
}

function listingEndValue(listing: SortableListing): Date | string | null | undefined {
  return listing.endsAt ?? listing.endTime;
}

function numericPrice(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  if (value == null || value === "") return Number.POSITIVE_INFINITY;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function createdAtMs(value: Date | string): number {
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
}

function endTimeMs(value: Date | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function compareEndTimes(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
  direction: "asc" | "desc",
): number {
  const leftMs = endTimeMs(left);
  const rightMs = endTimeMs(right);
  if (leftMs == null && rightMs == null) return 0;
  if (leftMs == null) return 1;
  if (rightMs == null) return -1;
  return direction === "asc" ? leftMs - rightMs : rightMs - leftMs;
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 80;
  return Math.min(Math.floor(value), 200);
}
