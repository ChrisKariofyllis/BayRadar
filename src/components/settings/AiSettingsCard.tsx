"use client";

import { useEffect, useState } from "react";

import {
  SettingsField,
  SettingsGroup,
  SettingsSecretToggle,
  SettingsStack,
} from "@/components/settings/SettingsGroup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  AI_PROVIDER_PRESETS,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_FALLBACK_MODEL,
  DEFAULT_AI_MODEL,
} from "@/lib/ai-defaults";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";

interface AiSettingsResponse {
  aiBaseUrl: string;
  aiModel: string;
  aiFallbackModel?: string;
  enableFallback?: boolean;
  hasApiKey: boolean;
  configured: boolean;
}

interface AiTestResponse {
  success: boolean;
  message: string;
  reply?: string;
  model?: string;
}

export function AiSettingsCard() {
  const { push } = useToast();
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_AI_BASE_URL);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL);
  const [aiFallbackModel, setAiFallbackModel] = useState(DEFAULT_AI_FALLBACK_MODEL);
  const [enableFallback, setEnableFallback] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiTestResponse | null>(null);

  useEffect(() => {
    api<AiSettingsResponse>("/api/settings/ai")
      .then((data) => {
        setAiBaseUrl(data.aiBaseUrl || DEFAULT_AI_BASE_URL);
        setAiModel(data.aiModel || DEFAULT_AI_MODEL);
        setAiFallbackModel(data.aiFallbackModel || DEFAULT_AI_FALLBACK_MODEL);
        setEnableFallback(data.enableFallback !== false);
        setHasApiKey(Boolean(data.hasApiKey));
        setConfigured(Boolean(data.configured));
      })
      .catch((err) => {
        push({
          tone: "error",
          title: "Could not load AI settings",
          description: err instanceof ApiError ? err.message : undefined,
        });
      });
  }, [push]);

  async function persistFallback(next: boolean) {
    const previous = enableFallback;
    setEnableFallback(next);
    if (!aiBaseUrl.trim() || !aiModel.trim()) return;
    try {
      const result = await api<AiSettingsResponse>("/api/settings/ai", {
        method: "POST",
        body: JSON.stringify({
          aiBaseUrl: aiBaseUrl.trim(),
          aiApiKey: aiApiKey.trim() || undefined,
          aiModel: aiModel.trim(),
          aiFallbackModel: aiFallbackModel.trim() || DEFAULT_AI_FALLBACK_MODEL,
          enableFallback: next,
        }),
      });
      setHasApiKey(result.hasApiKey);
      setConfigured(result.configured);
    } catch (err) {
      setEnableFallback(previous);
      push({
        tone: "error",
        title: "Could not update fallback",
        description: err instanceof ApiError ? err.message : undefined,
      });
    }
  }

  async function save() {
    if (!aiBaseUrl.trim()) {
      setError("Provider base URL is required.");
      return;
    }
    if (!aiModel.trim()) {
      setError("Model name is required.");
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const result = await api<AiSettingsResponse>("/api/settings/ai", {
        method: "POST",
        body: JSON.stringify({
          aiBaseUrl: aiBaseUrl.trim(),
          aiApiKey: aiApiKey.trim() || undefined,
          aiModel: aiModel.trim(),
          aiFallbackModel: aiFallbackModel.trim() || DEFAULT_AI_FALLBACK_MODEL,
          enableFallback,
        }),
      });
      setHasApiKey(result.hasApiKey);
      setConfigured(result.configured);
      setAiApiKey("");
      setTestResult(null);
      push({ tone: "success", title: "AI configuration saved" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Save failed";
      setError(message);
      push({ tone: "error", title: "Save failed", description: message });
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api<AiTestResponse>("/api/settings/ai/test", { method: "POST" });
      setTestResult(result);
      push({
        tone: result.success ? "success" : "error",
        title: result.success ? "AI connection OK" : "AI connection failed",
        description: result.message,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Test failed";
      setTestResult({ success: false, message });
      push({ tone: "error", title: "Test failed", description: message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <SettingsGroup
      footer={
        <>
          Examples: OpenAI <code className="text-zinc-300">https://api.openai.com/v1</code>, Groq{" "}
          <code className="text-zinc-300">https://api.groq.com/openai/v1</code>, OpenRouter{" "}
          <code className="text-zinc-300">https://openrouter.ai/api/v1</code>, Ollama{" "}
          <code className="text-zinc-300">http://localhost:11434/v1</code>.
        </>
      }
    >
      <div className="flex min-h-11 items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[17px] leading-5 text-zinc-50">Provider</p>
          <p className="mt-1 text-[13px] leading-4 text-zinc-400">
            OpenAI-compatible chat completions for smart negative keywords. Works with OpenAI, Groq, OpenRouter, or
            Ollama.
          </p>
        </div>
        <Badge tone={configured ? "success" : "warning"}>{configured ? "Ready" : "Not configured"}</Badge>
      </div>

      <SettingsStack>
        <SettingsField label="Provider base URL" htmlFor="ai-base-url">
          <div className="flex flex-wrap gap-1.5">
            {AI_PROVIDER_PRESETS.map((preset) => {
              const active = aiBaseUrl.replace(/\/+$/, "") === preset.aiBaseUrl.replace(/\/+$/, "");
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setAiBaseUrl(preset.aiBaseUrl);
                    setAiModel(preset.aiModel);
                  }}
                  className={cn(
                    "min-h-11 cursor-pointer rounded-full border px-3 text-xs font-medium tracking-wide transition-colors",
                    active
                      ? "border-amber-400/40 bg-amber-400/15 text-amber-100"
                      : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-50",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <Input
            id="ai-base-url"
            value={aiBaseUrl}
            onChange={(event) => setAiBaseUrl(event.target.value)}
            placeholder="https://api.openai.com/v1 or https://openrouter.ai/api/v1"
            autoComplete="off"
          />
        </SettingsField>

        <SettingsField label="API key" htmlFor="ai-api-key">
          <div className="relative">
            <Input
              id="ai-api-key"
              type={showKey ? "text" : "password"}
              value={aiApiKey}
              onChange={(event) => setAiApiKey(event.target.value)}
              placeholder={hasApiKey ? "Saved — enter a new key to replace it" : "sk-… (optional for local Ollama)"}
              autoComplete="new-password"
              className="pr-11"
            />
            <SettingsSecretToggle
              revealed={showKey}
              onToggle={() => setShowKey((value) => !value)}
              hideLabel="Hide API key"
              showLabel="Show API key"
            />
          </div>
        </SettingsField>

        <SettingsField label="Model name" htmlFor="ai-model">
          <Input
            id="ai-model"
            value={aiModel}
            onChange={(event) => setAiModel(event.target.value)}
            placeholder="gpt-4o-mini, llama-3.3-70b-versatile"
            autoComplete="off"
          />
        </SettingsField>

        <div className="grid gap-3 rounded-[12px] bg-white/[0.03] px-3 py-3 ring-1 ring-white/[0.06]">
          <div className="flex min-h-11 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[17px] leading-5 text-zinc-50">Fall back on rate limit</p>
              <p className="mt-1 text-[13px] leading-4 text-zinc-400">
                Retry the same batch on a lighter model when the primary provider returns 429.
              </p>
            </div>
            <Switch
              checked={enableFallback}
              onCheckedChange={(next) => void persistFallback(next)}
              label="Enable model fallback on rate limit"
            />
          </div>
          {enableFallback ? (
            <SettingsField label="Fallback model" htmlFor="ai-fallback-model">
              <Input
                id="ai-fallback-model"
                value={aiFallbackModel}
                onChange={(event) => setAiFallbackModel(event.target.value)}
                placeholder={DEFAULT_AI_FALLBACK_MODEL}
                autoComplete="off"
              />
            </SettingsField>
          ) : null}
        </div>

        <FieldError message={error} />

        {testResult ? (
          <Badge tone={testResult.success ? "success" : "danger"}>
            {testResult.success ? "Connected" : "Failed"} — {testResult.message}
          </Badge>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={save} loading={saving}>
            Save
          </Button>
          <Button className="min-h-11" variant="secondary" onClick={testConnection} loading={testing}>
            Test connection
          </Button>
        </div>
      </SettingsStack>
    </SettingsGroup>
  );
}
