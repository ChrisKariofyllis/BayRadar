import { formatBuyingLabel, formatCountdown, formatPrice, isAuction } from "../format";
import { failedResult, fetchNotification } from "../http";
import type { DealPayload, NotificationResult } from "../types";

const COLOR_AUCTION = 0xf59e0b;
const COLOR_BIN = 0x22c55e;

export async function sendDiscordNotification(
  setting: {
    endpointUrl?: string | null;
    name?: string | null;
  },
  deal: DealPayload,
): Promise<NotificationResult> {
  try {
    const webhookUrl = setting.endpointUrl?.trim();
    if (!webhookUrl) throw new Error("Discord endpointUrl (webhook URL) is required.");

    const countdown = formatCountdown(deal.endsAt);
    const fields = [
      { name: "Price", value: formatPrice(deal.price, deal.currency), inline: true },
      { name: "Format", value: formatBuyingLabel(deal.buyingFormat), inline: true },
    ];

    if (deal.bidCount != null && isAuction(deal.buyingFormat)) {
      fields.push({ name: "Bids", value: String(deal.bidCount), inline: true });
    }
    if (countdown) {
      fields.push({ name: "Ends in", value: countdown, inline: true });
    }

    await fetchNotification(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: setting.name?.trim() || "BayRadar",
        embeds: [
          {
            title: deal.title,
            url: deal.itemUrl,
            description: `New deal on **${deal.monitorName}**`,
            color: isAuction(deal.buyingFormat) ? COLOR_AUCTION : COLOR_BIN,
            thumbnail: deal.imageUrl ? { url: deal.imageUrl } : undefined,
            fields,
            footer: { text: `Item ${deal.itemId}` },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    return { success: true, provider: "DISCORD" };
  } catch (error) {
    return failedResult("DISCORD", error);
  }
}
