import type { NotificationProvider, NotificationSetting } from "@prisma/client";

import { prisma } from "@/db/prisma";

import { sendDiscordNotification } from "./providers/discord";
import { sendGotifyNotification } from "./providers/gotify";
import { sendNtfyNotification } from "./providers/ntfy";
import { sendTelegramNotification } from "./providers/telegram";
import type { DealPayload, NotificationResult } from "./types";

export type { DealPayload, NotificationResult } from "./types";

const adapters: Record<
  NotificationProvider,
  (setting: NotificationSetting, deal: DealPayload) => Promise<NotificationResult>
> = {
  NTFY: sendNtfyNotification,
  TELEGRAM: sendTelegramNotification,
  DISCORD: sendDiscordNotification,
  GOTIFY: sendGotifyNotification,
  EMAIL: async () => ({
    success: false,
    provider: "EMAIL",
    error: "EMAIL adapter is not implemented yet.",
  }),
};

export async function dispatchDealNotification(
  deal: DealPayload,
  options?: { settingId?: string; includeDisabled?: boolean },
): Promise<NotificationResult[]> {
  const settings = await prisma.notificationSetting.findMany({
    where: options?.settingId
      ? { id: options.settingId, ...(options.includeDisabled ? {} : { isEnabled: true }) }
      : { isEnabled: true },
    orderBy: { createdAt: "asc" },
  });

  if (settings.length === 0) {
    console.log(
      `[notify] No enabled notification channels. Deal: ${deal.title} — ${deal.price} ${deal.currency}`,
    );
    return [];
  }

  const settled = await Promise.allSettled(settings.map((setting) => dispatchToSetting(setting, deal)));

  return settled.map((result, index) => {
    if (result.status === "fulfilled") {
      logResult(result.value, settings[index]);
      return result.value;
    }

    const fallback: NotificationResult = {
      success: false,
      provider: settings[index]?.provider ?? "UNKNOWN",
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
    logResult(fallback, settings[index]);
    return fallback;
  });
}

export async function dispatchToSetting(
  setting: NotificationSetting,
  deal: DealPayload,
): Promise<NotificationResult> {
  const adapter = adapters[setting.provider];
  if (!adapter) {
    return { success: false, provider: setting.provider, error: `Unsupported provider ${setting.provider}` };
  }
  return adapter(setting, deal);
}

function logResult(result: NotificationResult, setting?: NotificationSetting): void {
  const label = setting?.name || setting?.channel || setting?.id || result.provider;
  if (result.success) {
    console.log(`[notify] ${result.provider} (${label}) delivered`);
    return;
  }
  console.error(`[notify] ${result.provider} (${label}) failed: ${result.error ?? "unknown error"}`);
}
