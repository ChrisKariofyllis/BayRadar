import { jsonOk } from "@/lib/api";
import { getAiRuntimeConfig, getEbayRuntimeConfig } from "@/services/config";
import { resolveEbayMockDecision } from "@/services/ebay/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [ebay, ai] = await Promise.all([getEbayRuntimeConfig(), getAiRuntimeConfig()]);
  const configuredMode = process.env.POLLER_MODE?.trim().toLowerCase();
  const mock = await resolveEbayMockDecision({
    hasCredentials: Boolean(ebay.appId && ebay.certId),
  });

  return jsonOk({
    ebay: {
      configured: Boolean(ebay.appId && ebay.certId),
      appIdConfigured: Boolean(ebay.appId),
      certIdConfigured: Boolean(ebay.certId),
      environment: ebay.environment,
      marketplaceId: ebay.marketplaceId,
      mockMode: mock.enabled,
      mockReason: mock.reason,
    },
    ai: {
      configured: ai.configured,
      model: ai.aiModel,
      baseUrl: ai.aiBaseUrl,
    },
    poller: {
      mode: configuredMode === "worker" || configuredMode === "serverless" ? configuredMode : "hybrid",
      defaultCron: process.env.WORKER_DEFAULT_CRON?.trim() || "*/5 * * * *",
    },
  });
}
