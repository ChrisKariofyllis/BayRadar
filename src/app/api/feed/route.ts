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
  const limit = clampLimit(Number(searchParams.get("limit") ?? 80));

  const where: Prisma.SeenListingWhereInput = {};
  if (monitorId) where.monitorId = monitorId;
  if (q) where.title = { contains: q };
  if (format === "AUCTION" || format === "FIXED_PRICE") {
    where.buyingFormat = { contains: format };
  }

  const listings = await prisma.seenListing.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      monitor: { select: { id: true, name: true } },
    },
  });

  return jsonOk({ listings });
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 80;
  return Math.min(Math.floor(value), 200);
}
