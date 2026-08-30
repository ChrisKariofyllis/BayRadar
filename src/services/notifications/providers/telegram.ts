import {
  escapeTelegramMarkdown,
  formatBuyingLabel,
  formatCountdown,
  formatPrice,
} from "../format";
import { failedResult, fetchNotification } from "../http";
import type { DealPayload, NotificationResult } from "../types";

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

    const caption = buildTelegramCaption(deal);
    const replyMarkup = {
      inline_keyboard: [[{ text: "Open in eBay", url: deal.itemUrl }]],
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

function buildTelegramCaption(deal: DealPayload): string {
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

  return lines.join("\n").slice(0, 1024);
}
