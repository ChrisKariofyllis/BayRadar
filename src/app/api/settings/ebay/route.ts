import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { ebayMockModeSchema, ebaySettingsSchema } from "@/lib/schemas/ebay-settings";
import { getConfigValue, getEbayRuntimeConfig, setConfigValues } from "@/services/config";
import { EbayAuthManager } from "@/services/ebay/auth";
import { resolveEbayMockDecision } from "@/services/ebay/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getEbayRuntimeConfig();
  const mock = await resolveEbayMockDecision({
    hasCredentials: Boolean(config.appId && config.certId),
  });
  return jsonOk({
    appId: config.appId,
    environment: config.environment,
    marketplaceId: config.marketplaceId,
    hasCertId: Boolean(config.certId),
    mockMode: mock.enabled,
    mockReason: mock.reason,
    source: {
      appId: (await getConfigValue("EBAY_APP_ID")) ? "resolved" : "unset",
    },
  });
}

export async function POST(request: Request) {
  try {
    const parsed = ebaySettingsSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    const current = await getEbayRuntimeConfig();
    const certId = parsed.data.certId?.trim() ?? "";
    const nextCert = certId && !certId.startsWith("••••") ? certId : current.certId;

    if (!nextCert) {
      return jsonError("Cert ID is required the first time you save eBay credentials.", 400);
    }

    await setConfigValues({
      EBAY_APP_ID: parsed.data.appId,
      EBAY_CERT_ID: nextCert,
      EBAY_ENVIRONMENT: parsed.data.environment,
      EBAY_MARKETPLACE_ID: parsed.data.marketplaceId,
    });
    EbayAuthManager.invalidate();

    return jsonOk({
      saved: true,
      appId: parsed.data.appId,
      environment: parsed.data.environment,
      marketplaceId: parsed.data.marketplaceId,
      hasCertId: true,
    });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/settings/ebay] POST failed: ${message}`);
    return jsonError("Failed to save eBay settings", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = ebayMockModeSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    await setConfigValues({
      EBAY_MOCK_MODE: parsed.data.mockMode ? "true" : "false",
    });

    const config = await getEbayRuntimeConfig();
    const mock = await resolveEbayMockDecision({
      hasCredentials: Boolean(config.appId && config.certId),
    });

    return jsonOk({
      saved: true,
      mockMode: mock.enabled,
      mockReason: mock.reason,
    });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/settings/ebay] PATCH failed: ${message}`);
    return jsonError("Failed to update mock mode", 500);
  }
}
