import { jsonOk } from "@/lib/api";
import { getEbayRuntimeConfig } from "@/services/config";
import { EbayAuthManager } from "@/services/ebay/auth";
import { ebayClient } from "@/services/ebay/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const config = await getEbayRuntimeConfig();

  try {
    const search = await ebayClient.searchItems({
      query: "playstation",
      buyingType: "ALL",
      limit: 1,
    });
    const usedMock = search.warnings?.some((warning) => /mock catalog/i.test(warning.message));

    if (!usedMock) {
      await EbayAuthManager.getAccessToken();
    }

    return jsonOk({
      success: true,
      message: usedMock
        ? `Mock catalog ready. Simulated Browse search returned ${search.total} result(s).`
        : `Connected to ${config.environment}. Browse API returned ${search.total} result(s).`,
      marketplace: config.marketplaceId,
      mock: Boolean(usedMock),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/settings/ebay/test] ${message}`);
    return jsonOk(
      {
        success: false,
        message,
        marketplace: config.marketplaceId,
      },
      200,
    );
  }
}
