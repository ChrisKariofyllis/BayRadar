import { prisma } from "@/db/prisma";
import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { updateMonitorSchema, type UpdateMonitorInput } from "@/lib/schemas/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const FILTER_FIELDS = ["query", "minPrice", "maxPrice", "negativeKeywords", "aiVerify"] as const;

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const monitor = await prisma.monitor.findUnique({
    where: { id },
    include: {
      _count: { select: { seenListings: true } },
      seenListings: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!monitor) {
    return jsonError("Monitor not found", 404);
  }

  return jsonOk({
    monitor: {
      ...monitor,
      seenListingsCount: monitor._count.seenListings,
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const existing = await prisma.monitor.findUnique({
      where: { id },
      select: {
        id: true,
        query: true,
        minPrice: true,
        maxPrice: true,
        negativeKeywords: true,
        aiVerify: true,
      },
    });
    if (!existing) {
      return jsonError("Monitor not found", 404);
    }

    const parsed = updateMonitorSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    if (shouldFlushSeenListings(existing, parsed.data)) {
      const cleared = await prisma.seenListing.deleteMany({ where: { monitorId: id } });
      console.log(`[api/monitors/${id}] Flushed ${cleared.count} seen listing(s) after filter change`);
    }

    const monitor = await prisma.monitor.update({
      where: { id },
      data: parsed.data,
      include: {
        _count: { select: { seenListings: true } },
      },
    });

    return jsonOk({
      monitor: {
        ...monitor,
        seenListingsCount: monitor._count.seenListings,
      },
    });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/monitors/${id}] PATCH failed: ${message}`);
    return jsonError("Failed to update monitor", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const existing = await prisma.monitor.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return jsonError("Monitor not found", 404);
    }

    await prisma.monitor.delete({ where: { id } });
    return jsonOk({ deleted: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/monitors/${id}] DELETE failed: ${message}`);
    return jsonError("Failed to delete monitor", 500);
  }
}

function shouldFlushSeenListings(
  existing: {
    query: string;
    minPrice: number | null;
    maxPrice: number;
    negativeKeywords: string | null;
    aiVerify: boolean;
  },
  patch: UpdateMonitorInput,
): boolean {
  for (const field of FILTER_FIELDS) {
    if (patch[field] === undefined) continue;
    if (patch[field] !== existing[field]) return true;
  }
  return false;
}
