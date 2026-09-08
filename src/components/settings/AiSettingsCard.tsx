"use client";

import { Eye, EyeOff, Info } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "@/lib/ai-defaults";
import { api, ApiError } from "@/lib/api-client";

interface AiSettingsResponse {
  aiBaseUrl: string;
  aiModel: string;
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
