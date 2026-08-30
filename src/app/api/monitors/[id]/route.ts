import { prisma } from "@/db/prisma";
import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { updateMonitorSchema } from "@/lib/schemas/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

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
    const existing = await prisma.monitor.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return jsonError("Monitor not found", 404);
    }

    const parsed = updateMonitorSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
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
