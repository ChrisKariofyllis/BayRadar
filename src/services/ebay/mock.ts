import { getConfigValue } from "@/services/config";

import type { EbayItemSummary, EbaySearchResponse, SearchParams } from "./types";

export const MOCK_TITLE_PREFIX = "[MOCK]";

export type EbayMockReason =
  | "env"
  | "settings"
  | "missing-credentials"
  | "invalid-credentials"
  | "off";

export interface EbayMockDecision {
  enabled: boolean;
  reason: EbayMockReason;
  forcedOff: boolean;
}

interface MockListingSeed {
  itemId: string;
  title: string;
  price: string;
  currency?: string;
  buyingOptions: string[];
  bidCount?: number;
  endsInHours?: number;
  condition: string;
  seller: { username: string; feedbackPercentage: string; feedbackScore: number };
  categoryId: string;
  categoryName: string;
  imageUrl?: string;
  shippingCost?: string;
}

const MOCK_SEEDS: MockListingSeed[] = [
  {
    itemId: "v1|110000000001|0",
    title: "PlayStation 5 Digital Edition - Like New",
    price: "290.00",
    buyingOptions: ["AUCTION"],
    bidCount: 7,
    endsInHours: 3,
    shippingCost: "6.90",
    condition: "USED_VERY_GOOD",
    seller: { username: "retro_deals_hh", feedbackPercentage: "99.6", feedbackScore: 1842 },
    categoryId: "139971",
    categoryName: "Video Games & Consoles",
  },
  {
    itemId: "v1|110000000002|0",
    title: "PS5 Digital *NUR KARTON / BOX ONLY*",
    price: "39.00",
    buyingOptions: ["FIXED_PRICE"],
    condition: "USED_ACCEPTABLE",
    seller: { username: "karton_king", feedbackPercentage: "91.2", feedbackScore: 48 },
    categoryId: "139971",
    categoryName: "Video Games & Consoles",
  },
  {
    itemId: "v1|110000000003|0",
    title: "Defekt - Parts only PS5 Digital Gehäuse",
    price: "55.00",
    buyingOptions: ["FIXED_PRICE"],
    condition: "FOR_PARTS_OR_NOT_WORKING",
    seller: { username: "parts_bin_nrw", feedbackPercentage: "88.0", feedbackScore: 112 },
    categoryId: "139971",
    categoryName: "Video Games & Consoles",
  },
  {
    itemId: "v1|110000000004|0",
    title: "Game Boy Color",
    price: "150.00",
    buyingOptions: ["FIXED_PRICE"],
    condition: "USED_GOOD",
    seller: { username: "handheld_vault", feedbackPercentage: "99.1", feedbackScore: 620 },
    categoryId: "139971",
    categoryName: "Video Games & Consoles",
  },
  {
    itemId: "v1|110000000005|0",
    title: "Nintendo Game Boy Pocket - working, battery door included",
    price: "42.00",
    buyingOptions: ["AUCTION", "FIXED_PRICE"],
    bidCount: 3,
    endsInHours: 18,
    shippingCost: "0.00",
    condition: "USED_GOOD",
    seller: { username: "pixel_basement", feedbackPercentage: "100.0", feedbackScore: 903 },
    categoryId: "139971",
    categoryName: "Video Games & Consoles",
  },
];

export function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

export function tagMockTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.startsWith(MOCK_TITLE_PREFIX) ? trimmed : `${MOCK_TITLE_PREFIX} ${trimmed}`;
}

export function buildMockCatalog(now = Date.now()): EbayItemSummary[] {
  return MOCK_SEEDS.map((seed) => toMockItem(seed, now));
}

export function searchMockItems(params: SearchParams, now = Date.now()): EbaySearchResponse {
  const catalog = buildMockCatalog(now);
  const matched = catalog.filter((item) => matchesMockSearch(item, params));
  const limit = clampLimit(params.limit ?? 50);

  return {
    total: matched.length,
    limit,
    offset: 0,
    itemSummaries: matched.slice(0, limit),
    warnings: [
      {
        errorId: 0,
        message: "BayRadar mock catalog — live eBay Browse API was not called.",
      },
    ],
  };
}

export function matchesMockSearch(item: EbayItemSummary, params: SearchParams): boolean {
  if (!matchesQuery(item, params.query)) return false;
  if (!matchesBuyingType(item, params.buyingType)) return false;
  if (params.categoryId?.trim()) {
    const wanted = params.categoryId.trim();
    if (!item.categories?.some((category) => category.categoryId === wanted)) {
      return false;
    }
  }
  const price = Number.parseFloat(item.currentBidPrice?.value ?? item.price?.value ?? "");
  if (!Number.isFinite(price)) return false;
  if (params.minPrice != null && price < params.minPrice) return false;
  if (params.maxPrice != null && price > params.maxPrice) return false;
  return true;
}

export function parseEnvFlag(value: string | undefined): boolean | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export async function resolveEbayMockDecision(options?: {
  hasCredentials?: boolean;
  invalidCredentials?: boolean;
}): Promise<EbayMockDecision> {
  const envFlag = parseEnvFlag(process.env.EBAY_MOCK_MODE);
  if (envFlag === true) {
    return { enabled: true, reason: "env", forcedOff: false };
  }
  if (envFlag === false) {
    return { enabled: false, reason: "off", forcedOff: true };
  }

  const settingsFlag = parseEnvFlag(await getConfigValue("EBAY_MOCK_MODE"));
  if (settingsFlag === true) {
    return { enabled: true, reason: "settings", forcedOff: false };
  }

  if (options?.invalidCredentials) {
    return { enabled: true, reason: "invalid-credentials", forcedOff: false };
  }

  if (options?.hasCredentials === false) {
    return { enabled: true, reason: "missing-credentials", forcedOff: false };
  }

  return { enabled: false, reason: "off", forcedOff: false };
}

export function isAuthOrCredentialError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /missing ebay api credentials/i.test(message) ||
    /oauth/i.test(message) ||
    /access token/i.test(message) ||
    /unauthorized/i.test(message) ||
    /invalid_client/i.test(message) ||
    /invalid_scope/i.test(message) ||
    /\b401\b/.test(message)
  );
}

function toMockItem(seed: MockListingSeed, now: number): EbayItemSummary {
  const currency = seed.currency ?? "EUR";
  const isAuction = seed.buyingOptions.includes("AUCTION");
  const endMs = seed.endsInHours != null ? now + seed.endsInHours * 3_600_000 : undefined;

  return {
    itemId: seed.itemId,
    title: tagMockTitle(seed.title),
    price: { value: seed.price, currency },
    ...(isAuction ? { currentBidPrice: { value: seed.price, currency } } : {}),
    bidCount: seed.bidCount,
    buyingOptions: seed.buyingOptions,
    itemWebUrl: `https://www.ebay.de/itm/${seed.itemId.replace(/\|/g, "-")}`,
    image: seed.imageUrl ? { imageUrl: seed.imageUrl } : undefined,
    seller: seed.seller,
    itemEndDate: endMs ? new Date(endMs).toISOString() : undefined,
    categories: [{ categoryId: seed.categoryId, categoryName: seed.categoryName }],
    condition: seed.condition,
    shippingOptions: seed.shippingCost
      ? [
          {
            shippingCostType: Number.parseFloat(seed.shippingCost) <= 0 ? "FREE" : "FIXED",
            shippingCost: { value: seed.shippingCost, currency },
          },
        ]
      : undefined,
  };
}

function matchesQuery(item: EbayItemSummary, query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const haystack = normalize(item.title);
  return tokens.every((token) => haystack.includes(token) || synonymMatches(haystack, token));
}

function synonymMatches(title: string, token: string): boolean {
  if (token === "ps5") return title.includes("playstation 5") || title.includes("ps5");
  if (token === "playstation") return title.includes("ps5") || title.includes("playstation");
  if (token === "gbc") return title.includes("game boy color");
  return false;
}

function matchesBuyingType(item: EbayItemSummary, buyingType: SearchParams["buyingType"]): boolean {
  if (!buyingType || buyingType === "ALL") return true;
  return item.buyingOptions.includes(buyingType);
}

function tokenize(query: string): string[] {
  return normalize(query)
    .replace(/(\d+)(gb|tb|mb)\b/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 1;
  return Math.min(Math.floor(limit), 200);
}

const STOP_WORDS = new Set(["the", "and", "for", "und", "der", "die", "das"]);
