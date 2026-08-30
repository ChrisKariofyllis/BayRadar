import { jsonOk } from "@/lib/api";
import { getEbayRuntimeConfig } from "@/services/config";
import { EbayAuthManager } from "@/services/ebay/auth";
import { ebayClient } from "@/services/ebay/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const config = await getEbayRuntimeConfig();

  try {
    await EbayAuthManager.getAccessToken();
    const search = await ebayClient.searchItems({
      query: "nintendo",
      buyingType: "ALL",
      limit: 1,
    });

    return jsonOk({
      success: true,
      message: `Connected to ${config.environment}. Browse API returned ${search.total} result(s).`,
      marketplace: config.marketplaceId,
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
