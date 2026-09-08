import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "@/lib/ai-defaults";
import { aiSettingsSchema } from "@/lib/schemas/ai-settings";
import { getAiRuntimeConfig } from "@/services/config";
import { prisma } from "@/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getAiRuntimeConfig();
  return jsonOk({
    aiBaseUrl: config.aiBaseUrl || DEFAULT_AI_BASE_URL,
    aiApiKey: config.aiApiKey ? "••••••••" : "",
    aiModel: config.aiModel || DEFAULT_AI_MODEL,
    hasApiKey: Boolean(config.aiApiKey),
    configured: config.configured,
  });
}

export async function POST(request: Request) {
  try {
    const parsed = aiSettingsSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    const current = await getAiRuntimeConfig();
    const incomingKey = parsed.data.aiApiKey?.trim() ?? "";
    const nextKey = incomingKey && !incomingKey.startsWith("••••") ? incomingKey : current.aiApiKey;

    await prisma.aiSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        aiBaseUrl: parsed.data.aiBaseUrl.replace(/\/+$/, ""),
        aiApiKey: nextKey || null,
        aiModel: parsed.data.aiModel,
      },
      update: {
        aiBaseUrl: parsed.data.aiBaseUrl.replace(/\/+$/, ""),
        aiApiKey: nextKey || null,
        aiModel: parsed.data.aiModel,
      },
    });

    const saved = await getAiRuntimeConfig();
    return jsonOk({
      saved: true,
      aiBaseUrl: saved.aiBaseUrl,
      aiModel: saved.aiModel,
      hasApiKey: Boolean(saved.aiApiKey),
      configured: saved.configured,
    });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/settings/ai] POST failed: ${message}`);
    return jsonError("Failed to save AI settings", 500);
  }
}
