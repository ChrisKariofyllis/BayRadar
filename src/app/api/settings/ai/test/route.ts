import { jsonOk } from "@/lib/api";
import { completeChat, AiClientError } from "@/services/ai/client";
import { getAiRuntimeConfig } from "@/services/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const config = await getAiRuntimeConfig();

  try {
    const reply = await completeChat({
      prompt: "Reply with OK",
      maxTokens: 8,
      temperature: 0,
    });

    return jsonOk({
      success: true,
      message: `Connected to ${config.aiModel} at ${config.aiBaseUrl}.`,
      reply: reply.slice(0, 80),
      model: config.aiModel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof AiClientError ? error.status : undefined;
    console.error(`[api/settings/ai/test] ${message}`);
    return jsonOk(
      {
        success: false,
        message,
        model: config.aiModel,
        status,
      },
      200,
    );
  }
}
