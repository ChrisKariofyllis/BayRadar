import "dotenv/config";

import { getEbayRuntimeConfig } from "@/services/config";

import { EbayAuthManager } from "./auth";
import { ebayClient } from "./client";
import type { EbayItemSummary } from "./types";

const TEST_QUERY = "Game Boy";
const TEST_MAX_PRICE = 50;
const TEST_LIMIT = 5;

async function missingCredentialNames(): Promise<string[]> {
  const config = await getEbayRuntimeConfig();
  const missing: string[] = [];
  if (!config.appId) missing.push("EBAY_APP_ID");
  if (!config.certId) missing.push("EBAY_CERT_ID");
  return missing;
}

function formatPrice(item: EbayItemSummary): string {
  const price = item.currentBidPrice ?? item.price;
  if (!price) return "n/a";
  return `${price.value} ${price.currency}`;
}

function formatBuyingFormat(item: EbayItemSummary): string {
  return item.buyingOptions?.length ? item.buyingOptions.join(", ") : "n/a";
}

async function main(): Promise<void> {
  const missing = await missingCredentialNames();
  if (missing.length > 0) {
    console.warn("eBay credentials are not configured. Using the mock catalog.");
    console.warn("Add them in Settings → eBay Account, or set these in .env:");
    console.warn(`  ${missing.join("\n  ")}`);
  } else {
    const token = await EbayAuthManager.getAccessToken();
    console.log(`OAuth token acquired (${token.slice(0, 12)}…), running test search.`);
  }

  const result = await ebayClient.searchItems({
    query: TEST_QUERY,
    maxPrice: TEST_MAX_PRICE,
    buyingType: "ALL",
    limit: TEST_LIMIT,
  });

  const items = result.itemSummaries ?? [];
  console.log(`Total items found: ${result.total}`);
  console.log(`Returned in this page: ${items.length} (limit=${result.limit}, offset=${result.offset})`);

  if (result.warnings?.length) {
    for (const warning of result.warnings) {
      console.warn(`Warning ${warning.errorId}: ${warning.message}`);
    }
  }

  if (items.length === 0) {
    console.log("No item summaries returned for this query.");
    return;
  }

  console.log("\nTop 3 items:");
  for (const [index, item] of items.slice(0, 3).entries()) {
    console.log(
      [
        `${index + 1}. ${item.title}`,
        `   Price: ${formatPrice(item)}`,
        `   Buying Format: ${formatBuyingFormat(item)}`,
        `   End Date: ${item.itemEndDate ?? "n/a"}`,
      ].join("\n"),
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`eBay test search failed: ${message}`);
  process.exitCode = 1;
});
