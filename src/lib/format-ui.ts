import type { BuyingType } from "./types";

export const CRON_PRESETS = [
  { value: "*/5 * * * *", label: "Every 5 minutes" },
  { value: "*/15 * * * *", label: "Every 15 minutes" },
  { value: "*/30 * * * *", label: "Every 30 minutes" },
  { value: "0 * * * *", label: "Every hour" },
] as const;

export function formatEuroAmount(price: number): string {
  return price.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatEuro(price: number, currency = "EUR"): string {
  return `${formatEuroAmount(price)} ${currency}`;
}

export function formatShipping(cost?: number | null, currency?: string | null): string {
  if (cost == null) return "Shipping not listed — check eBay";
  if (cost <= 0) return "Free shipping";
  return `${formatEuro(cost, currency ?? "EUR")} shipping`;
}

export function formatMonitorPriceRange(
  minPrice: number | null | undefined,
  maxPrice: number,
  currency = "EUR",
): string {
  if (minPrice != null) {
    return `${formatEuroAmount(minPrice)} – ${formatEuroAmount(maxPrice)} ${currency}`;
  }
  return `≤ ${formatEuro(maxPrice, currency)}`;
}

export function formatBuyingType(type: BuyingType | string): string {
  switch (type) {
    case "AUCTION":
      return "Auction";
    case "FIXED_PRICE":
      return "Buy It Now";
    case "ALL":
      return "All formats";
    default:
      return type;
  }
}

const AUCTION_TOKEN = /AUCTION|AUKTION|CHINESE|\bBID\b/i;

export function isAuctionFormat(buyingFormat?: string | null, format?: string | null): boolean {
  const raw = [buyingFormat, format].filter((value): value is string => Boolean(value?.trim())).join(",");
  if (!raw) return false;
  return AUCTION_TOKEN.test(raw.toUpperCase());
}

export function isAuctionListing(listing: {
  buyingFormat?: string | null;
  format?: string | null;
  bidCount?: number | null;
  endsAt?: string | Date | null;
  monitor?: { buyingType?: string | null } | null;
}): boolean {
  if (isAuctionFormat(listing.buyingFormat, listing.format)) return true;
  if (listing.monitor?.buyingType?.toUpperCase() === "AUCTION") return true;
  if ((listing.bidCount ?? 0) > 0) return true;

  const raw = `${listing.buyingFormat ?? ""} ${listing.format ?? ""}`.trim().toUpperCase();
  const unknown = !raw || raw === "UNKNOWN";
  const monitorType = listing.monitor?.buyingType?.toUpperCase();
  return Boolean(unknown && listing.endsAt && monitorType === "AUCTION");
}

export function isActiveSnipe(status?: string | null): boolean {
  return status === "PENDING" || status === "SCHEDULED" || status === "EXECUTING";
}

export function toActiveSnipe(task?: {
  id: string;
  maxBid: number;
  status: string;
  active?: boolean | null;
} | null): { id: string; maxBid: number; status: string } | null {
  if (!task) return null;
  if (!isActiveSnipe(task.status) && !task.active) return null;
  return { id: task.id, maxBid: task.maxBid, status: task.status };
}

export function listingActiveSnipe(listing: {
  activeSnipe?: { id: string; maxBid: number; status: string } | null;
  snipeTask?: { id: string; maxBid: number; status: string; active?: boolean | null } | null;
}): { id: string; maxBid: number; status: string } | null {
  if (listing.activeSnipe) return listing.activeSnipe;
  return toActiveSnipe(listing.snipeTask);
}

export function listingFormatLabel(buyingFormat?: string | null, format?: string | null): string {
  const raw = [buyingFormat, format].filter((value): value is string => Boolean(value?.trim())).join(",") || "";
  const auction = isAuctionFormat(raw);
  const bin = raw.toUpperCase().includes("FIXED_PRICE");
  if (auction && bin) return "Auction + BIN";
  if (auction) return "Auction";
  if (bin) return "Buy It Now";
  if (!raw || raw === "UNKNOWN") return "Listing";
  return raw;
}

export function listingCardFormatLabel(listing: Parameters<typeof isAuctionListing>[0]): string {
  const label = listingFormatLabel(listing.buyingFormat, listing.format);
  if ((label === "Listing" || label === "UNKNOWN") && isAuctionListing(listing)) return "Auction";
  return label;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  const delta = Date.now() - date.getTime();
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatCountdown(endsAt: string | null | undefined): string | null {
  if (!endsAt) return null;
  const endsMs = new Date(endsAt).getTime();
  if (Number.isNaN(endsMs)) return null;
  const remaining = endsMs - Date.now();
  if (remaining <= 0) return "Ended";
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

export function parseKeywords(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    // comma-separated fallback
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function cronLabel(expression: string): string {
  return CRON_PRESETS.find((preset) => preset.value === expression)?.label ?? expression;
}
