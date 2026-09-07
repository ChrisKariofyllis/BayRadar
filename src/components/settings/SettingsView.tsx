"use client";

import { useEffect, useState, type ReactNode } from "react";

import { EbaySettingsCard } from "@/components/settings/EbaySettingsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
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
    blurb: "Self-hosted Gotify app token + server URL.",
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">eBay credentials, notification channels, and system status.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-100">eBay integration</h2>
        <EbaySettingsCard />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-100">Notification channels</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {PROVIDERS.map((config) => {
            const draft = drafts[config.provider];
            return (
              <Card key={config.provider} className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-zinc-50">{config.title}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{config.blurb}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{draft.isEnabled ? "On" : "Off"}</span>
                    <Switch
                      checked={draft.isEnabled}
                      onCheckedChange={(isEnabled) => updateDraft(config.provider, { isEnabled })}
                      label={`Enable ${config.title}`}
                    />
                  </div>
                </div>
                <div className="grid gap-3">
                  {config.fields.includes("endpointUrl") ? (
                    <Field label="Endpoint URL">
                      <Input
                        value={draft.endpointUrl}
                        onChange={(event) => updateDraft(config.provider, { endpointUrl: event.target.value })}
                        placeholder={config.hints.endpointUrl}
                      />
                    </Field>
                  ) : null}
                  {config.fields.includes("authToken") ? (
                    <Field label="Auth / bot token">
                      <Input
                        type="password"
                        value={draft.authToken}
                        onChange={(event) => updateDraft(config.provider, { authToken: event.target.value })}
                        placeholder={draft.hasAuthToken ? "Saved — enter a new token to replace" : config.hints.authToken}
                      />
                    </Field>
                  ) : null}
                  {config.fields.includes("channel") ? (
                    <Field label="Channel / chat ID">
                      <Input
                        value={draft.channel}
                        onChange={(event) => updateDraft(config.provider, { channel: event.target.value })}
                        placeholder={config.hints.channel}
                      />
                    </Field>
                  ) : null}
                  {config.fields.includes("priority") ? (
                    <Field label="Priority">
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={draft.priority}
                        onChange={(event) => updateDraft(config.provider, { priority: event.target.value })}
                      />
                    </Field>
                  ) : null}
                  <FieldError message={errors[config.provider]} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" loading={saving === config.provider} onClick={() => save(config.provider)}>
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    loading={testing === config.provider || (saving === config.provider && !draft.id)}
                    onClick={() => test(config.provider)}
                  >
                    Send Test Notification
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-100">System status</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h3 className="font-medium text-zinc-50">eBay API</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Resolved from the Settings form first, then <code className="text-zinc-300">.env</code>.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={status?.ebay.mockMode ? "warning" : status?.ebay.configured ? "success" : "danger"}>
                {status?.ebay.mockMode
                  ? "Mock catalog"
                  : status?.ebay.configured
                    ? "Configured"
                    : "Missing credentials"}
              </Badge>
              <Badge tone={status?.ebay.appIdConfigured ? "success" : "warning"}>EBAY_APP_ID</Badge>
              <Badge tone={status?.ebay.certIdConfigured ? "success" : "warning"}>EBAY_CERT_ID</Badge>
            </div>
            <dl className="mt-4 grid gap-2 text-sm text-zinc-400">
              <div className="flex justify-between gap-4">
                <dt>Environment</dt>
                <dd className="text-zinc-200">{status?.ebay.environment ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Marketplace</dt>
                <dd className="text-zinc-200">{status?.ebay.marketplaceId ?? "—"}</dd>
              </div>
            </dl>
          </Card>
          <Card className="p-5">
            <h3 className="font-medium text-zinc-50">Poller mode</h3>
            <p className="mt-1 text-sm text-zinc-400">Hybrid deployment: serverless cron and/or the self-hosted worker.</p>
            <div className="mt-4">
              <Badge tone="info">{pollerLabel(status?.poller.mode)}</Badge>
            </div>
            <p className="mt-4 text-sm text-zinc-400">
              Cloud uses <code className="text-zinc-200">/api/cron/poll</code>. Self-hosted uses{" "}
              <code className="text-zinc-200">npm run worker</code> ({status?.poller.defaultCron ?? "*/5 * * * *"}).
              Set <code className="text-zinc-200">POLLER_MODE=serverless</code> or <code className="text-zinc-200">worker</code> to pin the indicator.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
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
  if (mode === "serverless") return "Serverless Cron";
  if (mode === "worker") return "Standalone Worker";
  return "Hybrid (Cron + Worker)";
}
