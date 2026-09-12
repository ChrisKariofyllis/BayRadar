import { prisma } from "@/db/prisma";
import { armListingSnipe } from "@/lib/sniper/arm";

const GET_UPDATES_TIMEOUT_SEC = 25;
const FETCH_TIMEOUT_MS = 35_000;
const IDLE_RETRY_MS = 15_000;
const ERROR_RETRY_MS = 5_000;
const CUSTOM_BID_TTL_MS = 2 * 60 * 1000;
const PROMPT_TEXT = "Reply to this message with your max bid in € (e.g. 175):";
const ARMED_SUFFIX_RE = /\n\n🎯 Armed with Gixen: €[^\n]*$/;

interface TelegramUser {
  id: number;
}

interface TelegramChat {
  id: number;
}

interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: unknown[];
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramBotConfig {
  token: string;
  chatIds: Set<string>;
}

interface PendingCustomBid {
  listingId: string;
  expiresAt: number;
}

const pendingCustomBids = new Map<number, PendingCustomBid>();

export async function startTelegramBotLoop(signal: AbortSignal): Promise<void> {
  let offset = 0;
  let lastToken = "";
  let pollerActive = false;
  let loggedWaiting = false;

  while (!signal.aborted) {
    try {
      const config = await loadTelegramBotConfig();
      if (!config) {
        if (pollerActive) {
          console.log("[telegram] Bot poller paused: Telegram is disabled or not configured");
          pollerActive = false;
        } else if (!loggedWaiting) {
          console.log("[telegram] Bot poller waiting: Telegram notifications are disabled or not configured");
          loggedWaiting = true;
        }
        await sleep(IDLE_RETRY_MS, signal);
        continue;
      }

      if (config.token !== lastToken) {
        offset = 0;
        lastToken = config.token;
      }

      if (!pollerActive) {
        const chatLabel = [...config.chatIds].join(",");
        console.log(`[telegram] Bot poller started (chatIds=${chatLabel})`);
        pollerActive = true;
        loggedWaiting = false;
      }

      const updates = await getUpdates(config.token, offset, signal);
      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await handleUpdate(config, update);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[telegram] Failed to handle update ${update.update_id}: ${message}`);
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("409")) {
        console.warn("[telegram] getUpdates conflict (webhook set?). Clearing webhook and retrying.");
        const token = lastToken || (await loadTelegramBotConfig())?.token;
        if (token) {
          await telegramCall(token, "deleteWebhook", { drop_pending_updates: false }).catch(() => undefined);
        }
      } else {
        console.error(`[telegram] Poller error: ${message}`);
      }
      await sleep(ERROR_RETRY_MS, signal);
    }
  }
}

async function loadTelegramBotConfig(): Promise<TelegramBotConfig | null> {
  const settings = await prisma.notificationSetting.findMany({
    where: { provider: "TELEGRAM", isEnabled: true },
    select: { authToken: true, channel: true },
  });

  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  const envChatId = process.env.TELEGRAM_CHAT_ID?.trim() || "";

  const token = settings.map((setting) => setting.authToken?.trim()).find(Boolean) || envToken;
  const chatIds = new Set<string>();
  for (const setting of settings) {
    const chatId = setting.channel?.trim();
    if (chatId) chatIds.add(chatId);
  }
  if (envChatId) chatIds.add(envChatId);

  if (!token || chatIds.size === 0) return null;
  return { token, chatIds };
}

function isAuthorized(config: TelegramBotConfig, fromId?: number, chatId?: number): boolean {
  if (fromId != null && config.chatIds.has(String(fromId))) return true;
  if (chatId != null && config.chatIds.has(String(chatId))) return true;
  return false;
}

async function handleUpdate(config: TelegramBotConfig, update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(config, update.callback_query);
    return;
  }
  if (update.message) {
    await handleMessage(config, update.message);
  }
}

async function handleCallbackQuery(config: TelegramBotConfig, query: TelegramCallbackQuery): Promise<void> {
  const fromId = query.from.id;
  const chatId = query.message?.chat.id;
  if (!isAuthorized(config, fromId, chatId)) {
    console.warn(`[telegram] Rejected callback from unauthorized user ${fromId}`);
    await answerCallbackQuery(config.token, query.id, "Unauthorized", true);
    return;
  }

  const data = query.data?.trim() ?? "";
  if (data.startsWith("snipe_prompt:")) {
    const listingId = data.slice("snipe_prompt:".length).trim();
    if (!listingId) {
      await answerCallbackQuery(config.token, query.id, "Missing listing.", true);
      return;
    }

    pendingCustomBids.set(fromId, {
      listingId,
      expiresAt: Date.now() + CUSTOM_BID_TTL_MS,
    });

    const targetChatId = chatId ?? fromId;
    await telegramCall(config.token, "sendMessage", {
      chat_id: targetChatId,
      text: PROMPT_TEXT,
      reply_markup: { force_reply: true, selective: true },
    });
    await answerCallbackQuery(config.token, query.id);
    return;
  }

  if (data.startsWith("snipe:")) {
    const parsed = parseSnipeCallback(data);
    if (!parsed) {
      await answerCallbackQuery(config.token, query.id, "Invalid snipe button.", true);
      return;
    }

    const result = await armListingSnipe(parsed.listingId, parsed.maxBid);
    if (!result.success) {
      await answerCallbackQuery(
        config.token,
        query.id,
        (result.error || "Failed to arm snipe.").slice(0, 200),
        true,
      );
      return;
    }

    const bidLabel = formatBidAmount(parsed.maxBid);
    await answerCallbackQuery(config.token, query.id, `🎯 Armed for €${bidLabel}!`);
    await appendArmedLineToAlert(config.token, query.message, parsed.maxBid);
    return;
  }

  await answerCallbackQuery(config.token, query.id);
}

async function handleMessage(config: TelegramBotConfig, message: TelegramMessage): Promise<void> {
  const fromId = message.from?.id;
  const chatId = message.chat.id;
  if (fromId == null || !isAuthorized(config, fromId, chatId)) {
    if (fromId != null) {
      console.warn(`[telegram] Ignored message from unauthorized user ${fromId}`);
    }
    return;
  }

  const text = message.text?.trim() ?? "";
  if (!text) return;

  if (/^\/cancel(?:@\w+)?$/i.test(text)) {
    pendingCustomBids.delete(fromId);
    await telegramCall(config.token, "sendMessage", {
      chat_id: chatId,
      text: "Custom bid cancelled.",
      reply_to_message_id: message.message_id,
    });
    return;
  }

  const pending = pendingCustomBids.get(fromId);
  if (!pending) return;
  if (pending.expiresAt <= Date.now()) {
    pendingCustomBids.delete(fromId);
    return;
  }

  const parsedBid = parseTelegramBid(text);
  if (parsedBid == null) {
    await telegramCall(config.token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Invalid amount. Please enter a valid number or click /cancel",
      reply_to_message_id: message.message_id,
    });
    return;
  }

  const result = await armListingSnipe(pending.listingId, parsedBid);
  if (!result.success) {
    await telegramCall(config.token, "sendMessage", {
      chat_id: chatId,
      text: `❌ ${result.error || "Failed to arm snipe."}`,
      reply_to_message_id: message.message_id,
    });
    return;
  }

  pendingCustomBids.delete(fromId);
  await telegramCall(config.token, "sendMessage", {
    chat_id: chatId,
    text: `✅ Gixen snipe successfully armed for €${formatBidAmount(parsedBid)}!`,
    reply_to_message_id: message.message_id,
  });
}

function parseSnipeCallback(data: string): { listingId: string; maxBid: number } | null {
  const rest = data.slice("snipe:".length);
  const sep = rest.lastIndexOf(":");
  if (sep <= 0) return null;
  const listingId = rest.slice(0, sep).trim();
  const maxBid = Number(rest.slice(sep + 1));
  if (!listingId || !Number.isFinite(maxBid) || maxBid <= 0) return null;
  return { listingId, maxBid: Math.round(maxBid * 100) / 100 };
}

export function parseTelegramBid(raw: string): number | null {
  let cleaned = raw.trim().replace(/€/gi, "").replace(/\s/g, "");
  if (!cleaned) return null;

  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function formatBidAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

async function appendArmedLineToAlert(
  token: string,
  message: TelegramMessage | undefined,
  maxBid: number,
): Promise<void> {
  if (!message) return;

  const suffix = `\n\n🎯 Armed with Gixen: €${formatBidAmount(maxBid)}`;
  const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
  const original = hasPhoto ? message.caption ?? "" : message.text ?? "";
  const stripped = original.replace(ARMED_SUFFIX_RE, "");
  const next = `${stripped}${suffix}`;

  try {
    if (hasPhoto) {
      await telegramCall(token, "editMessageCaption", {
        chat_id: message.chat.id,
        message_id: message.message_id,
        caption: next.slice(0, 1024),
        parse_mode: "Markdown",
      });
      return;
    }

    await telegramCall(token, "editMessageText", {
      chat_id: message.chat.id,
      message_id: message.message_id,
      text: next.slice(0, 4096),
      parse_mode: "Markdown",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[telegram] Could not edit armed alert: ${detail}`);
  }
}

async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<void> {
  await telegramCall(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: showAlert } : {}),
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[telegram] answerCallbackQuery failed: ${message}`);
  });
}

async function getUpdates(token: string, offset: number, signal: AbortSignal): Promise<TelegramUpdate[]> {
  const result = await telegramCall<TelegramUpdate[]>(
    token,
    "getUpdates",
    {
      offset,
      timeout: GET_UPDATES_TIMEOUT_SEC,
      allowed_updates: ["message", "callback_query"],
    },
    signal,
    FETCH_TIMEOUT_MS,
  );
  return Array.isArray(result) ? result : [];
}

async function telegramCall<T = unknown>(
  token: string,
  method: string,
  body: unknown,
  signal?: AbortSignal,
  timeoutMs = 12_000,
): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: combined,
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; result?: T; description?: string }
    | null;

  if (!response.ok || !payload?.ok) {
    const description = payload?.description || `${response.status} ${response.statusText}`;
    throw new Error(`${method} failed: ${description}`);
  }

  return payload.result as T;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
