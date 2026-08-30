import type { DealPayload } from "./types";

export function formatPrice(price: number, currency: string): string {
  const formatted = Number.isFinite(price)
    ? price.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(price);
  return `${formatted} ${currency}`.trim();
}

export function formatBuyingLabel(buyingFormat: string): string {
  const upper = buyingFormat.toUpperCase();
  const auction = upper.includes("AUCTION");
  const bin = upper.includes("FIXED_PRICE");
  if (auction && bin) return "Auction + Buy It Now";
  if (auction) return "Auction";
  if (bin) return "Buy It Now";
  return buyingFormat || "Listing";
}

export function isAuction(buyingFormat: string): boolean {
  return buyingFormat.toUpperCase().includes("AUCTION");
}

export function formatCountdown(endsAt?: Date | string | null): string | null {
  if (!endsAt) return null;
  const endsMs = new Date(endsAt).getTime();
  if (Number.isNaN(endsMs)) return null;
  const remaining = endsMs - Date.now();
  if (remaining <= 0) return "ended";

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

export function dealLines(deal: DealPayload): string[] {
  const lines = [
    deal.title,
    `Price: ${formatPrice(deal.price, deal.currency)}`,
    `Format: ${formatBuyingLabel(deal.buyingFormat)}`,
  ];

  if (deal.bidCount != null && isAuction(deal.buyingFormat)) {
    lines.push(`Bids: ${deal.bidCount}`);
  }

  const countdown = formatCountdown(deal.endsAt);
  if (countdown) {
    lines.push(`Ends in: ${countdown}`);
  }

  lines.push(deal.itemUrl);
  return lines;
}

export function dealPlainBody(deal: DealPayload): string {
  return dealLines(deal).join("\n");
}

export function dealMarkdownBody(deal: DealPayload): string {
  const countdown = formatCountdown(deal.endsAt);
  const lines = [
    `**${deal.title}**`,
    "",
    `- Price: **${formatPrice(deal.price, deal.currency)}**`,
    `- Format: ${formatBuyingLabel(deal.buyingFormat)}`,
  ];

  if (deal.bidCount != null && isAuction(deal.buyingFormat)) {
    lines.push(`- Bids: ${deal.bidCount}`);
  }
  if (countdown) {
    lines.push(`- Ends in: ${countdown}`);
  }

  lines.push("", `[Open listing](${deal.itemUrl})`);
  return lines.join("\n");
}

export function escapeTelegramMarkdown(text: string): string {
  return text.replace(/([_*`\[])/g, "\\$1");
}

export function oneLine(value: string, max = 120): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}
