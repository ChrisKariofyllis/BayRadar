import { dealPlainBody, formatPrice, oneLine } from "../format";
import { failedResult, fetchNotification } from "../http";
import type { DealPayload, NotificationResult } from "../types";

const DEFAULT_NTFY_HOST = "https://ntfy.sh";

export async function sendNtfyNotification(
  setting: {
    endpointUrl?: string | null;
    authToken?: string | null;
    channel?: string | null;
    priority?: number | null;
  },
  deal: DealPayload,
): Promise<NotificationResult> {
  try {
    const url = resolveNtfyUrl(setting.endpointUrl, setting.channel);
    const headers: Record<string, string> = {
      Title: oneLine(`BayRadar · ${deal.monitorName}`),
      Priority: String(clampPriority(setting.priority, 1, 5, 3)),
      Click: deal.itemUrl,
      Tags: isLikelyAuction(deal.buyingFormat) ? "hammer,moneybag" : "shopping,moneybag",
      Actions: `view, Open in eBay, ${deal.itemUrl}, clear=true`,
    };

    if (deal.imageUrl) {
      headers.Attach = deal.imageUrl;
    }
    if (setting.authToken?.trim()) {
      headers.Authorization = `Bearer ${setting.authToken.trim()}`;
    }

    const body = [
      deal.title,
      `${formatPrice(deal.price, deal.currency)} · ${deal.buyingFormat}`,
      "",
      dealPlainBody(deal),
    ].join("\n");

    await fetchNotification(url, {
      method: "POST",
      headers,
      body,
    });

    return { success: true, provider: "NTFY" };
  } catch (error) {
    return failedResult("NTFY", error);
  }
}

function resolveNtfyUrl(endpointUrl?: string | null, channel?: string | null): string {
  const explicit = endpointUrl?.trim();
  if (explicit) return explicit;

  const topic = channel?.trim();
  if (!topic) {
    throw new Error("ntfy requires endpointUrl or channel (topic).");
  }

  return `${DEFAULT_NTFY_HOST}/${encodeURIComponent(topic.replace(/^\/+/, ""))}`;
}

function clampPriority(value: number | null | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isLikelyAuction(buyingFormat: string): boolean {
  return buyingFormat.toUpperCase().includes("AUCTION");
}
