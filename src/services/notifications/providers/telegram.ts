import { isAuctionListing } from "@/lib/format-ui";

import {
  escapeTelegramMarkdown,
  formatBuyingLabel,
  formatCompactEuro,
  formatCountdown,
  formatPrice,
} from "../format";
import { failedResult, fetchNotification } from "../http";
import type { DealPayload, NotificationResult } from "../types";

type InlineKeyboardButton = { text: string; url: string } | { text: string; callback_data: string };

export async function sendTelegramNotification(
  setting: {
    authToken?: string | null;
    channel?: string | null;
  },
  deal: DealPayload,
): Promise<NotificationResult> {
  try {
    const token = setting.authToken?.trim();
    const chatId = setting.channel?.trim();
    if (!token) throw new Error("Telegram authToken (bot token) is required.");
    if (!chatId) throw new Error("Telegram channel (chat_id) is required.");

    const caption = formatListingTelegram(deal);
    const replyMarkup = {
      inline_keyboard: buildTelegramKeyboard(deal),
    };

    const endpoint = deal.imageUrl
      ? `https://api.telegram.org/bot${token}/sendPhoto`
      : `https://api.telegram.org/bot${token}/sendMessage`;

    const payload = deal.imageUrl
      ? {
          chat_id: chatId,
          photo: deal.imageUrl,
          caption,
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        }
      : {
          chat_id: chatId,
          text: caption,
          parse_mode: "Markdown",
          disable_web_page_preview: false,
          reply_markup: replyMarkup,
        };

    try {
      await fetchNotification(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (!deal.imageUrl) throw error;
      await fetchNotification(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: caption,
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        }),
      });
    }

    return { success: true, provider: "TELEGRAM" };
  } catch (error) {
    return failedResult("TELEGRAM", error);
  }
}

export function buildTelegramKeyboard(deal: DealPayload): InlineKeyboardButton[][] {
  const ebayButton: InlineKeyboardButton = { text: "Open in eBay ↗", url: deal.itemUrl };
  if (!deal.listingId || !dealIsAuction(deal)) {
    return [[ebayButton]];
  }

  const listingId = deal.listingId;
  const rows: InlineKeyboardButton[][] = [];
  const maxPrice = deal.maxPrice;

  if (maxPrice != null && Number.isFinite(maxPrice) && maxPrice > deal.price) {
    rows.push([
      {
        text: `🎯 Cap €${formatCompactEuro(maxPrice)}`,
        callback_data: snipeCallback(listingId, maxPrice),
      },
    ]);
  }

  rows.push([
    {
      text: `🎯 +€50 (€${formatCompactEuro(deal.price + 50)})`,
      callback_data: snipeCallback(listingId, deal.price + 50),
    },
    {
      text: `🎯 +€100 (€${formatCompactEuro(deal.price + 100)})`,
      callback_data: snipeCallback(listingId, deal.price + 100),
    },
  ]);

  rows.push([
    {
      text: "✏️ Custom Bid",
      callback_data: `snipe_prompt:${listingId}`,
    },
  ]);

  rows.push([ebayButton]);
  return rows;
}

function dealIsAuction(deal: DealPayload): boolean {
  return isAuctionListing({
    buyingFormat: deal.buyingFormat,
    bidCount: deal.bidCount,
    endsAt: deal.endsAt,
    monitor: { buyingType: deal.buyingType },
  });
}

function snipeCallback(listingId: string, maxBid: number): string {
  const rounded = Math.round(maxBid * 100) / 100;
  return `snipe:${listingId}:${rounded}`;
}

export function formatListingTelegram(deal: DealPayload): string {
  const countdown = formatCountdown(deal.endsAt);
  const lines = [
    `*${escapeTelegramMarkdown(deal.monitorName)}*`,
    escapeTelegramMarkdown(deal.title),
    "",
    `💰 *${escapeTelegramMarkdown(formatPrice(deal.price, deal.currency))}*`,
    `📦 ${escapeTelegramMarkdown(formatBuyingLabel(deal.buyingFormat))}`,
  ];

  if (deal.bidCount != null && deal.buyingFormat.toUpperCase().includes("AUCTION")) {
    lines.push(`🔨 Bids: ${deal.bidCount}`);
  }
  if (countdown) {
    lines.push(`⏱ Ends in: ${escapeTelegramMarkdown(countdown)}`);
  }
  if (
    deal.discountPercent != null &&
    deal.estimatedFmv != null &&
    Number.isFinite(deal.discountPercent) &&
    Number.isFinite(deal.estimatedFmv) &&
    deal.discountPercent > 0
  ) {
    lines.push(
      `🔥 Arbitrage: ~${Math.round(deal.discountPercent)}% below market (Est: €${formatCompactEuro(deal.estimatedFmv)})`,
    );
  }
  if (deal.idealoBWarePrice != null && Number.isFinite(deal.idealoBWarePrice)) {
    const shop = deal.idealoShopName?.trim() || "Idealo";
    lines.push(
      `🏷️ Idealo Refurb: ~€${formatCompactEuro(deal.idealoBWarePrice)} (${escapeTelegramMarkdown(shop)})`,
    );
  }

  return lines.join("\n").slice(0, 1024);
}

export async function sendTelegramPlainText(
  setting: {
    authToken?: string | null;
    channel?: string | null;
  },
  text: string,
): Promise<NotificationResult> {
  try {
    const token = setting.authToken?.trim();
    const chatId = setting.channel?.trim();
    if (!token) throw new Error("Telegram authToken (bot token) is required.");
    if (!chatId) throw new Error("Telegram channel (chat_id) is required.");

    await fetchNotification(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    return { success: true, provider: "TELEGRAM" };
  } catch (error) {
    return failedResult("TELEGRAM", error);
  }
}
