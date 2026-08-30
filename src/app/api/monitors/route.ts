import { prisma } from "@/db/prisma";
import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { createMonitorSchema } from "@/lib/schemas/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const monitors = await prisma.monitor.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { seenListings: true } },
    },
  });

  return jsonOk({
    monitors: monitors.map((monitor) => ({
      ...monitor,
      seenListingsCount: monitor._count.seenListings,
    })),
  });
}

export async function POST(request: Request) {
  try {
    const parsed = createMonitorSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    const monitor = await prisma.monitor.create({
      data: parsed.data,
      include: {
        _count: { select: { seenListings: true } },
      },
    });

    return jsonOk(
      {
        monitor: {
          ...monitor,
          seenListingsCount: monitor._count.seenListings,
        },
      },
      201,
    );
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/monitors] POST failed: ${message}`);
    return jsonError("Failed to create monitor", 500);
  }
}
