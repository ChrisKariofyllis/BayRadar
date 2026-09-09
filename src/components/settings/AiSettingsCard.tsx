"use client";

import { Eye, EyeOff, Info } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
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
    <Card className="divide-y divide-white/[0.06] p-0">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-zinc-50">AI Configuration</h3>
            <p className="mt-1 text-sm text-zinc-400">
              OpenAI-compatible chat completions for smart negative keywords. Works with OpenAI, Groq,
              OpenRouter, or Ollama.
            </p>
          </div>
          <Badge tone={configured ? "success" : "warning"}>{configured ? "Ready" : "Not configured"}</Badge>
        </div>
      </div>

      <div className="grid gap-4 p-5">
        <div className="grid gap-1.5">
          <Label htmlFor="ai-base-url">Provider Base URL</Label>
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
                    "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide transition-colors",
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
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ai-api-key">API Key</Label>
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
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-zinc-100"
              onClick={() => setShowKey((value) => !value)}
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ai-model">Model Name</Label>
          <Input
            id="ai-model"
            value={aiModel}
            onChange={(event) => setAiModel(event.target.value)}
            placeholder="gpt-4o-mini, llama-3.3-70b-versatile"
            autoComplete="off"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">Enable Model Fallback on Rate Limit / Quota Exhaustion (429)</p>
              <p className="mt-1 text-xs text-zinc-500">
                Retry the same batch on a lighter model when the primary provider returns 429.
              </p>
            </div>
            <Switch
              checked={enableFallback}
              onCheckedChange={setEnableFallback}
              label="Enable model fallback on rate limit"
            />
          </div>
          {enableFallback ? (
            <div className="grid gap-1.5">
              <Label htmlFor="ai-fallback-model">Fallback Model Name</Label>
              <Input
                id="ai-fallback-model"
                value={aiFallbackModel}
                onChange={(event) => setAiFallbackModel(event.target.value)}
                placeholder={DEFAULT_AI_FALLBACK_MODEL}
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>

        <FieldError message={error} />

        {testResult ? (
          <Badge tone={testResult.success ? "success" : "danger"}>
            {testResult.success ? "Connected" : "Failed"} — {testResult.message}
          </Badge>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} loading={saving}>
            Save AI Settings
          </Button>
          <Button variant="outline" onClick={testConnection} loading={testing}>
            Test AI Connection
          </Button>
        </div>

        <p className="flex items-start gap-2 text-sm text-zinc-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Examples: OpenAI <code className="text-zinc-400">https://api.openai.com/v1</code>, Groq{" "}
            <code className="text-zinc-400">https://api.groq.com/openai/v1</code>, OpenRouter{" "}
            <code className="text-zinc-400">https://openrouter.ai/api/v1</code>, Ollama{" "}
            <code className="text-zinc-400">http://localhost:11434/v1</code>.
          </span>
        </p>
      </div>
    </Card>
  );
}
