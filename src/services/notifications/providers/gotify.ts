import { dealMarkdownBody, formatPrice, oneLine } from "../format";
import { failedResult, fetchNotification } from "../http";
import type { DealPayload, NotificationResult } from "../types";

export async function sendGotifyNotification(
  setting: {
    endpointUrl?: string | null;
    authToken?: string | null;
    priority?: number | null;
  },
  deal: DealPayload,
): Promise<NotificationResult> {
  try {
    const base = setting.endpointUrl?.trim();
    if (!base) throw new Error("Gotify endpointUrl is required.");
    if (!setting.authToken?.trim()) throw new Error("Gotify authToken (app token) is required.");

    const url = resolveGotifyMessageUrl(base);
    await fetchNotification(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gotify-Key": setting.authToken.trim(),
      },
      body: JSON.stringify({
        title: oneLine(`BayRadar · ${deal.monitorName} · ${formatPrice(deal.price, deal.currency)}`),
        message: dealMarkdownBody(deal),
        priority: clampPriority(setting.priority, 0, 10, 5),
        extras: {
          "client::display": { contentType: "text/markdown" },
          "client::notification": { click: { url: deal.itemUrl } },
        },
      }),
    });

    return { success: true, provider: "GOTIFY" };
  } catch (error) {
    return failedResult("GOTIFY", error);
  }
}

function resolveGotifyMessageUrl(endpointUrl: string): string {
  const trimmed = endpointUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/message") ? trimmed : `${trimmed}/message`;
}

function clampPriority(value: number | null | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
