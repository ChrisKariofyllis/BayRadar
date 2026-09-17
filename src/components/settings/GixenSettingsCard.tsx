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

  async function persistEnabled(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    if (!username.trim() || (!hasPassword && !password.trim())) {
      return;
    }
    try {
      const result = await api<GixenSettingsResponse>("/api/settings/gixen", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim() || undefined,
          enabled: next,
        }),
      });
      setHasPassword(result.hasPassword);
      setConfigured(result.configured);
      setEnabled(result.enabled);
      setHandshakeOk(Boolean(result.handshakeOk));
      setMirrorActive(Boolean(result.mirrorActive));
    } catch (err) {
      setEnabled(previous);
      push({
        tone: "error",
        title: "Could not update Gixen",
        description: err instanceof ApiError ? err.message : undefined,
      });
    }
  }

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
        description: result.handshakeOk ? undefined : "Run Test connection to verify the web login handshake.",
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
    <SettingsGroup
      footer={
        <>
          Ready turns green only after a successful login handshake. Create or manage your account at{" "}
          <a
            href="https://www.gixen.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 underline-offset-2 hover:underline"
          >
            gixen.com
          </a>
          . Settings override <code className="text-zinc-300">GIXEN_USERNAME</code> /{" "}
          <code className="text-zinc-300">GIXEN_PASSWORD</code> in <code className="text-zinc-300">.env</code>.
        </>
      }
    >
      <div className="flex min-h-11 items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[17px] leading-5 text-zinc-50">Enable Gixen sniping</p>
          <p className="mt-1 text-[13px] leading-4 text-zinc-400">
            When on, auction cards can submit a max bid through your Gixen web session.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={ready ? "success" : configured && enabled ? "warning" : "neutral"}>
            {ready ? "Ready" : configured && enabled ? "Handshake required" : configured ? "Disabled" : "Not configured"}
          </Badge>
          <Switch checked={enabled} onCheckedChange={(next) => void persistEnabled(next)} label="Enable Gixen sniping" />
        </div>
      </div>

      <SettingsStack>
        <SettingsField label="Username" htmlFor="gixen-username">
          <Input
            id="gixen-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Your Gixen username"
            autoComplete="username"
          />
        </SettingsField>

        <SettingsField label="Password" htmlFor="gixen-password">
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
            <SettingsSecretToggle
              revealed={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
              hideLabel="Hide password"
              showLabel="Show password"
            />
          </div>
        </SettingsField>

        <FieldError message={error} />

        {mirrorActive && handshakeOk ? <Badge tone="success">Gixen Mirror confirmed</Badge> : null}

        {testResult ? (
          <Badge tone={testResult.success ? "success" : "danger"}>
            {testResult.success ? "Connected" : "Failed"} — {testResult.message}
          </Badge>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={() => void save()} loading={saving}>
            Save
          </Button>
          <Button className="min-h-11" variant="secondary" onClick={() => void testConnection()} loading={testing}>
            Test connection
          </Button>
        </div>
      </SettingsStack>
    </SettingsGroup>
  );
}
