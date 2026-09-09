import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const monitorId = searchParams.get("monitorId")?.trim() || undefined;
  const format = searchParams.get("format")?.trim().toUpperCase() || undefined;
  const q = searchParams.get("q")?.trim() || undefined;
  const sort = parseSort(searchParams.get("sort"));
  const limit = clampLimit(Number(searchParams.get("limit") ?? 80));

  const where: Prisma.SeenListingWhereInput = { status: "ACCEPTED" };
  if (monitorId) where.monitorId = monitorId;
  if (q) where.title = { contains: q };
  if (format === "AUCTION" || format === "FIXED_PRICE") {
    where.buyingFormat = { contains: format };
  }

  const listings = await prisma.seenListing.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      monitor: { select: { id: true, name: true } },
    },
  });

  return jsonOk({ listings: sortListings(listings, sort).slice(0, limit) });
}

export async function DELETE() {
  const deleted = await prisma.seenListing.deleteMany({});
  return jsonOk({ success: true, count: deleted.count });
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
