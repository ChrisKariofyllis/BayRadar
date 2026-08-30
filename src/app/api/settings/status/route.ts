import { jsonOk } from "@/lib/api";
import { getEbayRuntimeConfig } from "@/services/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ebay = await getEbayRuntimeConfig();
  const configuredMode = process.env.POLLER_MODE?.trim().toLowerCase();

  return jsonOk({
    ebay: {
      configured: Boolean(ebay.appId && ebay.certId),
      appIdConfigured: Boolean(ebay.appId),
      certIdConfigured: Boolean(ebay.certId),
      environment: ebay.environment,
      marketplaceId: ebay.marketplaceId,
    },
    poller: {
      mode: configuredMode === "worker" || configuredMode === "serverless" ? configuredMode : "hybrid",
      defaultCron: process.env.WORKER_DEFAULT_CRON?.trim() || "*/5 * * * *",
    },
  });
}
