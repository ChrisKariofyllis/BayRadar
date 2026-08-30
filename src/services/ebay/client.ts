import { EbayAuthManager, getEbayApiBaseUrl } from "./auth";
import type { EbaySearchResponse, SearchParams } from "./types";

const SEARCH_PATH = "/buy/browse/v1/item_summary/search";
const DEFAULT_MARKETPLACE = "EBAY_DE";
const DEFAULT_LIMIT = 50;
const MAX_SEARCH_LIMIT = 200;
const MAX_RETRIES = 3;

const MARKETPLACE_COUNTRY: Record<string, string> = {
  EBAY_AT: "AT",
  EBAY_AU: "AU",
  EBAY_BE: "BE",
  EBAY_CA: "CA",
  EBAY_CH: "CH",
  EBAY_DE: "DE",
  EBAY_ES: "ES",
  EBAY_FR: "FR",
  EBAY_GB: "GB",
  EBAY_HK: "HK",
  EBAY_IE: "IE",
  EBAY_IT: "IT",
  EBAY_MOTORS_US: "US",
  EBAY_MY: "MY",
  EBAY_NL: "NL",
  EBAY_PH: "PH",
  EBAY_PL: "PL",
  EBAY_SG: "SG",
  EBAY_TW: "TW",
  EBAY_US: "US",
};

const MARKETPLACE_CURRENCY: Record<string, string> = {
  EBAY_AT: "EUR",
  EBAY_AU: "AUD",
  EBAY_BE: "EUR",
  EBAY_CA: "CAD",
  EBAY_CH: "CHF",
  EBAY_DE: "EUR",
  EBAY_ES: "EUR",
  EBAY_FR: "EUR",
  EBAY_GB: "GBP",
  EBAY_HK: "HKD",
  EBAY_IE: "EUR",
  EBAY_IT: "EUR",
  EBAY_MOTORS_US: "USD",
  EBAY_MY: "MYR",
  EBAY_NL: "EUR",
  EBAY_PH: "PHP",
  EBAY_PL: "PLN",
  EBAY_SG: "SGD",
  EBAY_TW: "TWD",
  EBAY_US: "USD",
};

export class EbayApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "EbayApiError";
  }
}

export class EbayClient {
  async searchItems(params: SearchParams): Promise<EbaySearchResponse> {
    const url = this.buildSearchUrl(params);
    return this.requestJson<EbaySearchResponse>(url, params.query);
  }

  buildSearchUrl(params: SearchParams): string {
    const query = new URLSearchParams();
    const q = params.query.trim();
    if (!q) {
      throw new EbayApiError("Search query must not be empty.");
    }

    query.set("q", q);

    const categoryId = params.categoryId?.trim();
    if (categoryId) {
      query.set("category_ids", categoryId);
    }

    const filter = buildSearchFilter(params);
    if (filter) {
      query.set("filter", filter);
    }

    const buyingType = params.buyingType ?? "ALL";
    query.set(
      "sort",
      params.sort ?? (buyingType === "AUCTION" ? "endingSoonest" : "newlyListed"),
    );

    const limit = clampLimit(params.limit ?? DEFAULT_LIMIT);
    query.set("limit", String(limit));

    return `${getEbayApiBaseUrl()}${SEARCH_PATH}?${query.toString()}`;
  }

  private async requestJson<T>(url: string, queryLabel: string): Promise<T> {
    let unauthorizedRetried = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const token = await EbayAuthManager.getAccessToken();
      let response: Response;

      try {
        response = await fetch(url, {
          method: "GET",
          headers: this.buildHeaders(token),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (attempt < MAX_RETRIES) {
          console.warn(
            `[ebay] Network error on search "${queryLabel}" (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${reason}`,
          );
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new EbayApiError(`eBay Browse search failed after network errors: ${reason}`);
      }

      if (response.status === 401 && !unauthorizedRetried) {
        unauthorizedRetried = true;
        EbayAuthManager.invalidate();
        console.warn("[ebay] Access token rejected (401). Refreshing and retrying once.");
        continue;
      }

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const delay = retryAfterMs(response) ?? backoffMs(attempt);
        console.warn(
          `[ebay] Rate limited (429) on search "${queryLabel}". Retrying in ${delay}ms.`,
        );
        await sleep(delay);
        continue;
      }

      const rawBody = await response.text();

      if (!response.ok) {
        throw new EbayApiError(
          `eBay Browse search failed (${response.status} ${response.statusText}) for "${queryLabel}": ${rawBody || "no response body"}`,
          response.status,
          rawBody,
        );
      }

      try {
        return JSON.parse(rawBody) as T;
      } catch {
        throw new EbayApiError("eBay Browse search response was not valid JSON.", response.status, rawBody);
      }
    }

    throw new EbayApiError(`eBay Browse search exhausted retries for "${queryLabel}".`);
  }

  private buildHeaders(accessToken: string): HeadersInit {
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || DEFAULT_MARKETPLACE;
    const country = marketplaceToCountry(marketplaceId);

    return {
      Authorization: `Bearer ${accessToken}`,
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
      "X-EBAY-C-ENDUSERCTX": `contextualLocation=country=${country}`,
      "Content-Type": "application/json",
    };
  }
}

export const ebayClient = new EbayClient();

export function buildSearchFilter(params: SearchParams): string {
  const parts: string[] = [];
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || DEFAULT_MARKETPLACE;
  const hasPriceBound = params.minPrice != null || params.maxPrice != null;

  if (hasPriceBound) {
    const min = params.minPrice != null ? String(params.minPrice) : "";
    const max = params.maxPrice != null ? String(params.maxPrice) : "";
    parts.push(`price:[${min}..${max}]`);
    parts.push(`priceCurrency:${MARKETPLACE_CURRENCY[marketplaceId] ?? "EUR"}`);
  }

  if (params.buyingType === "AUCTION") {
    parts.push("buyingOptions:{AUCTION}");
  } else if (params.buyingType === "FIXED_PRICE") {
    parts.push("buyingOptions:{FIXED_PRICE}");
  } else {
    // Browse API defaults to FIXED_PRICE-only. Explicitly include auctions for ALL.
    parts.push("buyingOptions:{AUCTION|FIXED_PRICE}");
  }

  return parts.join(",");
}

function marketplaceToCountry(marketplaceId: string): string {
  if (MARKETPLACE_COUNTRY[marketplaceId]) {
    return MARKETPLACE_COUNTRY[marketplaceId];
  }

  const suffix = marketplaceId.replace(/^EBAY_/, "");
  return suffix.length === 2 ? suffix : "DE";
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 1;
  return Math.min(Math.floor(limit), MAX_SEARCH_LIMIT);
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

function backoffMs(attempt: number): number {
  return 1000 * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
