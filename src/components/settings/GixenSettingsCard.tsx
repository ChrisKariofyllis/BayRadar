"use client";

import { Eye, EyeOff, Info } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";

interface GixenSettingsResponse {
  username: string;
  hasPassword: boolean;
  enabled: boolean;
  configured: boolean;
  handshakeOk?: boolean;
  handshakeAt?: string | null;
  mirrorActive?: boolean;
}

interface GixenTestResponse {
  success: boolean;
  message: string;
  handshakeOk?: boolean;
  mirrorActive?: boolean;
}

export function GixenSettingsCard() {
  const { push } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [handshakeOk, setHandshakeOk] = useState(false);
  const [mirrorActive, setMirrorActive] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<GixenTestResponse | null>(null);

  const ready = enabled && handshakeOk;

  useEffect(() => {
    api<GixenSettingsResponse>("/api/settings/gixen")
      .then((data) => {
        setUsername(data.username ?? "");
        setHasPassword(Boolean(data.hasPassword));
        setEnabled(Boolean(data.enabled));
        setConfigured(Boolean(data.configured));
        setHandshakeOk(Boolean(data.handshakeOk));
        setMirrorActive(Boolean(data.mirrorActive));
      })
      .catch((err) => {
        push({
          tone: "error",
          title: "Could not load Gixen settings",
          description: err instanceof ApiError ? err.message : undefined,
        });
      });
  }, [push]);

  async function save() {
    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    if (!hasPassword && !password.trim()) {
      setError("Password is required.");
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const result = await api<GixenSettingsResponse>("/api/settings/gixen", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim() || undefined,
          enabled,
        }),
      });
      setHasPassword(result.hasPassword);
      setConfigured(result.configured);
      setEnabled(result.enabled);
      setHandshakeOk(Boolean(result.handshakeOk));
      setMirrorActive(Boolean(result.mirrorActive));
      setPassword("");
      setTestResult(null);
      push({
        tone: "success",
        title: "Gixen configuration saved",
        description: result.handshakeOk
          ? undefined
          : "Run Test Connection to verify the web login handshake.",
      });
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
      const result = await api<GixenTestResponse>("/api/settings/gixen/test", { method: "POST" });
      setTestResult(result);
      setHandshakeOk(Boolean(result.handshakeOk && result.success));
      setMirrorActive(Boolean(result.mirrorActive));
      push({
        tone: result.success ? "success" : "error",
        title: result.success ? "Gixen handshake OK" : "Gixen handshake failed",
        description: result.message,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Test failed";
      setHandshakeOk(false);
      setMirrorActive(false);
      setTestResult({ success: false, message, handshakeOk: false, mirrorActive: false });
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
            <h3 className="font-medium text-zinc-50">Sniping / Gixen Configuration</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Signs into gixen.com with your account and submits snipes through the dashboard form.
              The legacy XML API is disabled.
            </p>
          </div>
          <Badge tone={ready ? "success" : configured && enabled ? "warning" : configured ? "neutral" : "neutral"}>
            {ready ? "Ready" : configured && enabled ? "Handshake required" : configured ? "Disabled" : "Not configured"}
          </Badge>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 p-5">
        <div>
          <h4 className="font-medium text-zinc-50">Enable Gixen Sniping</h4>
          <p className="mt-1 text-sm text-zinc-400">
            When on, auction cards can submit a max bid through your Gixen web session.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{enabled ? "On" : "Off"}</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} label="Enable Gixen Sniping" />
        </div>
      </div>

      <div className="grid gap-4 p-5">
        <div className="grid gap-1.5">
          <Label htmlFor="gixen-username">GIXEN_USERNAME</Label>
          <Input
            id="gixen-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Your Gixen username"
            autoComplete="username"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="gixen-password">GIXEN_PASSWORD</Label>
          <div className="relative">
            <Input
              id="gixen-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={hasPassword ? "Saved — enter a new password to replace it" : "Your Gixen password"}
              autoComplete="new-password"
              className="pr-11"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-zinc-100"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <FieldError message={error} />

        {mirrorActive && handshakeOk ? (
          <Badge tone="success">Gixen Mirror confirmed</Badge>
        ) : null}

        {testResult ? (
          <Badge tone={testResult.success ? "success" : "danger"}>
            {testResult.success ? "Connected" : "Failed"} — {testResult.message}
          </Badge>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} loading={saving}>
            Save Configuration
          </Button>
          <Button variant="outline" onClick={() => void testConnection()} loading={testing}>
            Test Connection
          </Button>
        </div>

        <p className="flex items-start gap-2 text-sm text-zinc-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Ready turns green only after a successful login handshake. Create or manage your account at{" "}
            <a
              href="https://www.gixen.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 underline-offset-2 hover:underline"
            >
              gixen.com
            </a>
            . Settings override <code className="text-zinc-400">GIXEN_USERNAME</code> /{" "}
            <code className="text-zinc-400">GIXEN_PASSWORD</code> in <code className="text-zinc-400">.env</code>.
          </span>
        </p>
      </div>
    </Card>
  );
}
