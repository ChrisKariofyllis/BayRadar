"use client";

import { useEffect, useState, type ReactNode } from "react";

import { AiSettingsCard } from "@/components/settings/AiSettingsCard";
import { EbaySettingsCard } from "@/components/settings/EbaySettingsCard";
import { ExperimentalSettingsCard } from "@/components/settings/ExperimentalSettingsCard";
import { GixenSettingsCard } from "@/components/settings/GixenSettingsCard";
import {
  SettingsField,
  SettingsGroup,
  SettingsSection,
  SettingsStack,
} from "@/components/settings/SettingsGroup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import type { NotificationChannel, NotificationProvider, SystemStatus } from "@/lib/types";

const PROVIDERS: Array<{
  provider: NotificationProvider;
  title: string;
  blurb: string;
  fields: Array<"endpointUrl" | "authToken" | "channel" | "priority">;
  hints: Partial<Record<"endpointUrl" | "authToken" | "channel", string>>;
}> = [
  {
    provider: "NTFY",
    title: "Ntfy",
    blurb: "Push to ntfy.sh or a self-hosted topic.",
    fields: ["endpointUrl", "channel", "authToken", "priority"],
    hints: {
      endpointUrl: "https://ntfy.sh/your-topic (optional if channel is set)",
      channel: "Topic name",
      authToken: "Bearer token if the topic is protected",
    },
  },
  {
    provider: "TELEGRAM",
    title: "Telegram",
    blurb: "Bot API messages with an inline eBay button.",
    fields: ["authToken", "channel"],
    hints: {
      authToken: "Bot token from @BotFather",
      channel: "Chat ID or @channel",
    },
  },
  {
    provider: "DISCORD",
    title: "Discord",
    blurb: "Incoming webhook with a color-coded embed.",
    fields: ["endpointUrl", "priority"],
    hints: {
      endpointUrl: "https://discord.com/api/webhooks/…",
    },
  },
  {
    provider: "GOTIFY",
    title: "Gotify",
    blurb: "Self-hosted Gotify app token and server URL.",
    fields: ["endpointUrl", "authToken", "priority"],
    hints: {
      endpointUrl: "https://gotify.example.com",
      authToken: "Application token",
    },
  },
];

type Draft = {
  id?: string;
  name: string;
  endpointUrl: string;
  authToken: string;
  channel: string;
  priority: string;
  isEnabled: boolean;
  hasAuthToken: boolean;
};

const emptyDraft = (): Draft => ({
  name: "",
  endpointUrl: "",
  authToken: "",
  channel: "",
  priority: "3",
  isEnabled: true,
  hasAuthToken: false,
});

export function SettingsView() {
  const { push } = useToast();
  const [drafts, setDrafts] = useState<Record<NotificationProvider, Draft>>({
    NTFY: emptyDraft(),
    TELEGRAM: emptyDraft(),
    DISCORD: emptyDraft(),
    GOTIFY: emptyDraft(),
    EMAIL: emptyDraft(),
  });
  const [errors, setErrors] = useState<Partial<Record<NotificationProvider, string>>>({});
  const [saving, setSaving] = useState<NotificationProvider | null>(null);
  const [testing, setTesting] = useState<NotificationProvider | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ notifications: NotificationChannel[] }>("/api/notifications"),
      api<SystemStatus>("/api/settings/status"),
    ])
      .then(([notificationData, system]) => {
        setDrafts((current) => hydrateDrafts(current, notificationData.notifications));
        setStatus(system);
      })
      .catch((error) => {
        push({
          tone: "error",
          title: "Could not load settings",
          description: error instanceof ApiError ? error.message : undefined,
        });
      });
  }, [push]);

  function updateDraft(provider: NotificationProvider, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [provider]: { ...current[provider], ...patch } }));
  }

  async function persistEnabled(provider: NotificationProvider, isEnabled: boolean) {
    const draft = drafts[provider];
    updateDraft(provider, { isEnabled });
    if (!draft.id) return;
    try {
      const payload: Record<string, unknown> = {
        id: draft.id,
        provider,
        name: draft.name || provider,
        endpointUrl: draft.endpointUrl || null,
        channel: draft.channel || null,
        priority: Number(draft.priority || 3),
        isEnabled,
      };
      if (draft.authToken.trim()) payload.authToken = draft.authToken.trim();
      const result = await api<{ notification: NotificationChannel }>("/api/notifications", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      updateDraft(provider, { id: result.notification.id, hasAuthToken: Boolean(result.notification.hasAuthToken) });
    } catch (error) {
      updateDraft(provider, { isEnabled: draft.isEnabled });
      push({
        tone: "error",
        title: "Could not update channel",
        description: error instanceof ApiError ? error.message : undefined,
      });
    }
  }

  async function save(provider: NotificationProvider, thenTest = false) {
    const draft = drafts[provider];
    const localError = validateProvider(provider, draft);
    setErrors((current) => ({ ...current, [provider]: localError }));
    if (localError) return;

    setSaving(provider);
    try {
      const payload: Record<string, unknown> = {
        provider,
        name: draft.name || provider,
        endpointUrl: draft.endpointUrl || null,
        channel: draft.channel || null,
        priority: Number(draft.priority || 3),
        isEnabled: draft.isEnabled,
      };
      if (draft.id) payload.id = draft.id;
      if (draft.authToken.trim()) payload.authToken = draft.authToken.trim();

      const result = await api<{ notification: NotificationChannel }>("/api/notifications", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const saved = result.notification;
      updateDraft(provider, {
        id: saved.id,
        authToken: "",
        hasAuthToken: Boolean(saved.hasAuthToken),
      });
      push({ tone: "success", title: `${provider} saved` });
      if (thenTest && saved.id) {
        await test(provider, saved.id);
      }
    } catch (error) {
      push({
        tone: "error",
        title: "Save failed",
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setSaving(null);
    }
  }

  async function test(provider: NotificationProvider, settingId?: string) {
    const id = settingId ?? drafts[provider].id;
    if (!id) {
      await save(provider, true);
      return;
    }
    setTesting(provider);
    try {
      const result = await api<{ sent: number; results: Array<{ success: boolean; error?: string }> }>(
        "/api/notifications/test",
        { method: "POST", body: JSON.stringify({ id }) },
      );
      const first = result.results[0];
      if (first?.success) {
        push({ tone: "success", title: "Test notification sent", description: `${provider} accepted the payload.` });
      } else {
        push({ tone: "error", title: "Test failed", description: first?.error || "Provider rejected the test." });
      }
    } catch (error) {
      push({
        tone: "error",
        title: "Test failed",
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-zinc-50">Settings</h1>
        <p className="mt-1 text-[15px] text-zinc-400">
          eBay credentials, Gixen sniping, AI exclusions, experimental valuation, notification channels, and system
          status.
        </p>
      </div>

      <SettingsSection title="eBay integration">
        <EbaySettingsCard />
      </SettingsSection>

      <SettingsSection title="Sniping / Gixen">
        <GixenSettingsCard />
      </SettingsSection>

      <SettingsSection title="AI configuration">
        <AiSettingsCard />
      </SettingsSection>

      <SettingsSection title="Experimental">
        <ExperimentalSettingsCard />
      </SettingsSection>

      <SettingsSection title="Notification channels">
        <div className="space-y-6">
          {PROVIDERS.map((config) => {
            const draft = drafts[config.provider];
            const idPrefix = config.provider.toLowerCase();
            return (
              <SettingsGroup key={config.provider}>
                <div className="flex min-h-11 items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[17px] leading-5 text-zinc-50">{config.title}</p>
                    <p className="mt-1 text-[13px] leading-4 text-zinc-400">{config.blurb}</p>
                  </div>
                  <Switch
                    checked={draft.isEnabled}
                    onCheckedChange={(isEnabled) => void persistEnabled(config.provider, isEnabled)}
                    label={`Enable ${config.title}`}
                  />
                </div>
                <SettingsStack>
                  {config.fields.includes("endpointUrl") ? (
                    <SettingsField label="Endpoint URL" htmlFor={`${idPrefix}-endpoint`}>
                      <Input
                        id={`${idPrefix}-endpoint`}
                        value={draft.endpointUrl}
                        onChange={(event) => updateDraft(config.provider, { endpointUrl: event.target.value })}
                        placeholder={config.hints.endpointUrl}
                      />
                    </SettingsField>
                  ) : null}
                  {config.fields.includes("authToken") ? (
                    <SettingsField label="Auth / bot token" htmlFor={`${idPrefix}-token`}>
                      <Input
                        id={`${idPrefix}-token`}
                        type="password"
                        value={draft.authToken}
                        onChange={(event) => updateDraft(config.provider, { authToken: event.target.value })}
                        placeholder={draft.hasAuthToken ? "Saved — enter a new token to replace" : config.hints.authToken}
                      />
                    </SettingsField>
                  ) : null}
                  {config.fields.includes("channel") ? (
                    <SettingsField label="Channel / chat ID" htmlFor={`${idPrefix}-channel`}>
                      <Input
                        id={`${idPrefix}-channel`}
                        value={draft.channel}
                        onChange={(event) => updateDraft(config.provider, { channel: event.target.value })}
                        placeholder={config.hints.channel}
                      />
                    </SettingsField>
                  ) : null}
                  {config.fields.includes("priority") ? (
                    <SettingsField label="Priority" htmlFor={`${idPrefix}-priority`}>
                      <Select
                        id={`${idPrefix}-priority`}
                        value={draft.priority}
                        onChange={(event) => updateDraft(config.provider, { priority: event.target.value })}
                      >
                        {Array.from({ length: 11 }, (_, index) => (
                          <option key={index} value={String(index)}>
                            {index}
                          </option>
                        ))}
                      </Select>
                    </SettingsField>
                  ) : null}
                  <FieldError message={errors[config.provider]} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="min-h-11"
                      variant="secondary"
                      loading={saving === config.provider}
                      onClick={() => save(config.provider)}
                    >
                      Save
                    </Button>
                    <Button
                      className="min-h-11"
                      variant="outline"
                      loading={testing === config.provider || (saving === config.provider && !draft.id)}
                      onClick={() => test(config.provider)}
                    >
                      Send test
                    </Button>
                  </div>
                </SettingsStack>
              </SettingsGroup>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="System status">
        <SettingsGroup
          footer={
            <>
              Cloud uses <code className="text-zinc-300">/api/cron/poll</code>. Self-hosted uses{" "}
              <code className="text-zinc-300">npm run worker</code> ({status?.poller.defaultCron ?? "*/5 * * * *"}). Set{" "}
              <code className="text-zinc-300">POLLER_MODE=serverless</code> or <code className="text-zinc-300">worker</code>{" "}
              to pin the indicator.
            </>
          }
        >
          <StatusRow
            title="eBay API"
            detail={`${status?.ebay.environment ?? "—"} · ${status?.ebay.marketplaceId ?? "—"}`}
            blurb="Resolved from the settings form first, then .env."
            badge={
              <Badge tone={status?.ebay.mockMode ? "warning" : status?.ebay.configured ? "success" : "danger"}>
                {status?.ebay.mockMode
                  ? "Mock catalog"
                  : status?.ebay.configured
                    ? "Configured"
                    : "Missing credentials"}
              </Badge>
            }
          />
          <StatusRow
            title="AI provider"
            detail={status?.ai?.model ?? "—"}
            blurb="Used by AI Smart Exclude on monitors. Local Ollama does not need an API key."
            badge={
              <Badge tone={status?.ai?.configured ? "success" : "warning"}>
                {status?.ai?.configured ? "Configured" : "Not configured"}
              </Badge>
            }
          />
          <StatusRow
            title="Gixen sniping"
            blurb="Last-second bids are submitted to Gixen, not placed by BayRadar."
            badge={
              <Badge
                tone={
                  status?.gixen?.enabled && status.gixen.handshakeOk
                    ? "success"
                    : status?.gixen?.configured
                      ? "warning"
                      : "neutral"
                }
              >
                {status?.gixen?.enabled && status.gixen.handshakeOk
                  ? status.gixen.mirrorActive
                    ? "Ready · Mirror"
                    : "Ready"
                  : status?.gixen?.configured
                    ? "Handshake required"
                    : "Not configured"}
              </Badge>
            }
          />
          <StatusRow
            title="Poller mode"
            blurb="Hybrid deployment: serverless cron and/or the self-hosted worker."
            badge={<Badge tone="info">{pollerLabel(status?.poller.mode)}</Badge>}
          />
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}

function StatusRow({
  title,
  blurb,
  detail,
  badge,
}: {
  title: string;
  blurb: string;
  detail?: string;
  badge: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[17px] leading-5 text-zinc-50">{title}</p>
        <p className="mt-1 text-[13px] leading-4 text-zinc-400">{blurb}</p>
        {detail ? <p className="mt-1 truncate text-[13px] leading-4 text-zinc-300">{detail}</p> : null}
      </div>
      <div className="shrink-0 pt-0.5">{badge}</div>
    </div>
  );
}

function hydrateDrafts(
  current: Record<NotificationProvider, Draft>,
  notifications: NotificationChannel[],
): Record<NotificationProvider, Draft> {
  const next = { ...current };
  for (const setting of notifications) {
    if (next[setting.provider]?.id) continue;
    next[setting.provider] = {
      id: setting.id,
      name: setting.name ?? "",
      endpointUrl: setting.endpointUrl ?? "",
      authToken: "",
      channel: setting.channel ?? "",
      priority: String(setting.priority ?? 3),
      isEnabled: setting.isEnabled,
      hasAuthToken: Boolean(setting.hasAuthToken),
    };
  }
  return next;
}

function validateProvider(provider: NotificationProvider, draft: Draft): string | undefined {
  if (provider === "TELEGRAM" && !draft.channel.trim()) {
    return "Telegram needs a chat ID / channel.";
  }
  if (provider === "TELEGRAM" && !draft.authToken.trim() && !draft.hasAuthToken) {
    return "Telegram needs a bot token.";
  }
  if (provider === "DISCORD" && !draft.endpointUrl.trim()) {
    return "Discord needs a webhook URL.";
  }
  if (provider === "GOTIFY" && (!draft.endpointUrl.trim() || (!draft.authToken.trim() && !draft.hasAuthToken))) {
    return "Gotify needs a server URL and app token.";
  }
  if (provider === "NTFY" && !draft.endpointUrl.trim() && !draft.channel.trim()) {
    return "Ntfy needs a topic channel or full endpoint URL.";
  }
  return undefined;
}

function pollerLabel(mode?: SystemStatus["poller"]["mode"]) {
  if (mode === "serverless") return "Serverless cron";
  if (mode === "worker") return "Standalone worker";
  return "Hybrid (cron + worker)";
}
