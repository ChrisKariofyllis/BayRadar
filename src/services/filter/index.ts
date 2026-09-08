import type { BuyingType, Monitor } from "@prisma/client";

import type { EbayItemSummary } from "@/services/ebay/types";

export const DEFAULT_NEGATIVE_KEYWORDS = [
  "ovp",
  "defekt",
  "nur karton",
  "box only",
  "case only",
  "parts only",
] as const;

export interface ListingEvaluation {
  passed: boolean;
  reasons: string[];
}

export function evaluateListing(item: EbayItemSummary, monitor: Monitor): ListingEvaluation {
  const reasons: string[] = [];
  const price = listingEffectivePrice(item);

  if (price == null) {
    reasons.push("price is missing or invalid");
  } else {
    if (monitor.minPrice != null && price < monitor.minPrice) {
      reasons.push(`price ${price} is below minPrice ${monitor.minPrice}`);
    }
    if (price > monitor.maxPrice) {
      reasons.push(`price ${price} exceeds maxPrice ${monitor.maxPrice}`);
    }
  }

  if (!matchesBuyingType(item, monitor.buyingType)) {
    reasons.push(`buyingOptions ${formatBuyingOptions(item)} do not match ${monitor.buyingType}`);
  }

  if (isAuction(item) && monitor.maxRemainingHours != null) {
    const remainingHours = remainingHoursUntil(item.itemEndDate);
    if (remainingHours == null) {
      reasons.push("auction is missing itemEndDate; cannot apply maxRemainingHours");
    } else if (remainingHours < 0) {
      reasons.push("auction has already ended");
    } else if (remainingHours > monitor.maxRemainingHours) {
      reasons.push(
        `auction remaining ${remainingHours.toFixed(2)}h exceeds maxRemainingHours ${monitor.maxRemainingHours}`,
      );
    }
  }

  const hit = firstNegativeKeywordHit(item.title, parseNegativeKeywords(monitor.negativeKeywords));
  if (hit) {
    reasons.push(`title matches negative keyword "${hit}"`);
  }

  return { passed: reasons.length === 0, reasons };
}

export function listingEffectivePrice(item: EbayItemSummary): number | null {
  const raw = item.currentBidPrice?.value ?? item.price?.value;
  if (raw == null || raw === "") return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

export function parseNegativeKeywords(raw: string | null | undefined): string[] {
  const fromMonitor = parseKeywordList(raw);
  return uniqueKeywords([...DEFAULT_NEGATIVE_KEYWORDS, ...fromMonitor]);
}

function parseKeywordList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);
    }
  } catch {
    // Allow a comma-separated fallback if the monitor was edited by hand.
  }

  return raw
    .split(",")
    .map((value) => value.trim().replace(/^\[?"|"?\]$/g, ""))
    .filter(Boolean);
}

function firstNegativeKeywordHit(title: string, keywords: string[]): string | null {
  const haystack = title ?? "";
  for (const keyword of keywords) {
    if (titleMatchesKeyword(haystack, keyword)) {
      return keyword;
    }
  }
  return null;
}

function titleMatchesKeyword(title: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
  return pattern.test(title);
}

function matchesBuyingType(item: EbayItemSummary, buyingType: BuyingType): boolean {
  if (buyingType === "ALL") return true;
  const options = item.buyingOptions ?? [];
  return options.includes(buyingType);
}

function isAuction(item: EbayItemSummary): boolean {
  return (item.buyingOptions ?? []).includes("AUCTION");
}

function remainingHoursUntil(isoDate: string | undefined): number | null {
  if (!isoDate) return null;
  const endsAt = Date.parse(isoDate);
  if (Number.isNaN(endsAt)) return null;
  return (endsAt - Date.now()) / 3_600_000;
}

function formatBuyingOptions(item: EbayItemSummary): string {
  return item.buyingOptions?.length ? item.buyingOptions.join(",") : "(none)";
}

function uniqueKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const keyword of keywords) {
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
  }
  return result;
}
