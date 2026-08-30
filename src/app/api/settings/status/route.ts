import { jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const appId = Boolean(process.env.EBAY_APP_ID?.trim());
  const certId = Boolean(process.env.EBAY_CERT_ID?.trim());
  const configuredMode = process.env.POLLER_MODE?.trim().toLowerCase();

  return jsonOk({
    ebay: {
      configured: appId && certId,
      appIdConfigured: appId,
      certIdConfigured: certId,
      environment: process.env.EBAY_ENVIRONMENT?.trim() || "PRODUCTION",
      marketplaceId: process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_DE",
    },
    poller: {
      mode: configuredMode === "worker" || configuredMode === "serverless" ? configuredMode : "hybrid",
      defaultCron: process.env.WORKER_DEFAULT_CRON?.trim() || "*/5 * * * *",
    },
  });
}
