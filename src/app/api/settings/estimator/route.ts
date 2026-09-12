import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { estimatorSettingsSchema } from "@/lib/schemas/estimator";
import { getAiRuntimeConfig, getEstimatorRuntimeConfig } from "@/services/config";
import { prisma } from "@/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [estimator, ai] = await Promise.all([getEstimatorRuntimeConfig(), getAiRuntimeConfig()]);
  return jsonOk({
    enabled: estimator.enabled,
    minDiscount: estimator.minDiscount,
    aiConfigured: ai.configured,
  });
}

export async function POST(request: Request) {
  try {
    const parsed = estimatorSettingsSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    await prisma.aiSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        priceEstimatorEnabled: parsed.data.enabled,
        minArbitrageDiscount: parsed.data.minDiscount,
      },
      update: {
        priceEstimatorEnabled: parsed.data.enabled,
        minArbitrageDiscount: parsed.data.minDiscount,
      },
    });

    const [estimator, ai] = await Promise.all([getEstimatorRuntimeConfig(), getAiRuntimeConfig()]);
    return jsonOk({
      saved: true,
      enabled: estimator.enabled,
      minDiscount: estimator.minDiscount,
      aiConfigured: ai.configured,
    });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/settings/estimator] POST failed: ${message}`);
    return jsonError("Failed to save estimator settings", 500);
  }
}
