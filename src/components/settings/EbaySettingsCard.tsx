"use client";

import { ChevronDown, Eye, EyeOff, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import { EBAY_MARKETPLACES } from "@/lib/ebay-marketplaces";

interface EbaySettingsResponse {
  appId: string;
  environment: "PRODUCTION" | "SANDBOX";
  marketplaceId: string;
  hasCertId: boolean;
  mockMode: boolean;
  mockReason: "env" | "settings" | "missing-credentials" | "invalid-credentials" | "off";
}

interface EbayTestResponse {
  success: boolean;
  message: string;
  marketplace: string;
  mock?: boolean;
}

export function EbaySettingsCard() {
  const { push } = useToast();
  const [appId, setAppId] = useState("");
  const [certId, setCertId] = useState("");
  const [hasCertId, setHasCertId] = useState(false);
  const [showCert, setShowCert] = useState(false);
  const [environment, setEnvironment] = useState<"PRODUCTION" | "SANDBOX">("PRODUCTION");
  const [marketplaceId, setMarketplaceId] = useState("EBAY_DE");
  const [marketplaceQuery, setMarketplaceQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<EbayTestResponse | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [mockReason, setMockReason] = useState<EbaySettingsResponse["mockReason"]>("off");
  const [savingMock, setSavingMock] = useState(false);

  useEffect(() => {
    api<EbaySettingsResponse>("/api/settings/ebay")
      .then((data) => {
        setAppId(data.appId ?? "");
        setHasCertId(Boolean(data.hasCertId));
        setEnvironment(data.environment ?? "PRODUCTION");
        setMarketplaceId(data.marketplaceId ?? "EBAY_DE");
        setMockMode(Boolean(data.mockMode));
        setMockReason(data.mockReason ?? "off");
      })
      .catch((err) => {
        push({
          tone: "error",
          title: "Could not load eBay settings",
          description: err instanceof ApiError ? err.message : undefined,
        });
      });
  }, [push]);

  const marketplaces = useMemo(() => {
    const q = marketplaceQuery.trim().toLowerCase();
    if (!q) return EBAY_MARKETPLACES;
    return EBAY_MARKETPLACES.filter(
      (item) => item.id.toLowerCase().includes(q) || item.label.toLowerCase().includes(q),
    );
  }, [marketplaceQuery]);

  async function save() {
    if (!appId.trim()) {
      setError("App ID is required.");
      return;
    }
    if (!hasCertId && !certId.trim()) {
      setError("Cert ID is required.");
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const result = await api<EbaySettingsResponse>("/api/settings/ebay", {
        method: "POST",
        body: JSON.stringify({
          appId: appId.trim(),
          certId: certId.trim() || undefined,
          environment,
          marketplaceId,
        }),
      });
      setHasCertId(result.hasCertId);
      setCertId("");
      setTestResult(null);
      push({ tone: "success", title: "eBay configuration saved" });
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
      const result = await api<EbayTestResponse>("/api/settings/ebay/test", { method: "POST" });
      setTestResult(result);
      push({
        tone: result.success ? "success" : "error",
        title: result.success
          ? result.mock
            ? "Mock catalog ready"
            : "eBay connection OK"
          : "eBay connection failed",
        description: result.message,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Test failed";
      setTestResult({ success: false, message, marketplace: marketplaceId });
      push({ tone: "error", title: "Test failed", description: message });
    } finally {
      setTesting(false);
    }
  }

  async function toggleMock(next: boolean) {
    setSavingMock(true);
    const previous = mockMode;
    setMockMode(next);
    try {
      const result = await api<Pick<EbaySettingsResponse, "mockMode" | "mockReason">>("/api/settings/ebay", {
        method: "PATCH",
        body: JSON.stringify({ mockMode: next }),
      });
      setMockMode(result.mockMode);
      setMockReason(result.mockReason);
      push({
        tone: "success",
        title: result.mockMode ? "eBay mock mode enabled" : "eBay mock mode disabled",
        description: result.mockMode
          ? "Poller, filters, and notifications will use the simulated catalog."
          : "Live eBay Browse API will be used when credentials are present.",
      });
    } catch (err) {
      setMockMode(previous);
      push({
        tone: "error",
        title: "Could not update mock mode",
        description: err instanceof ApiError ? err.message : undefined,
      });
    } finally {
      setSavingMock(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-zinc-50">eBay Account & API Configuration</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Stored in BayRadar&apos;s database. <code className="text-zinc-300">.env</code> values are used only as fallback.
        </p>
      </div>

      <div className="mb-5 rounded-lg border border-amber-400/20 bg-amber-400/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="font-medium text-zinc-50">Demo / mock engine</h4>
            <p className="mt-1 text-sm text-zinc-400">
              Exercise the full deal pipeline while the eBay app is under review. Listings are tagged{" "}
              <code className="text-zinc-300">[MOCK]</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">{mockMode ? "On" : "Off"}</span>
            <Switch
              checked={mockMode}
              disabled={savingMock}
              onCheckedChange={toggleMock}
              label="Enable eBay mock mode"
            />
          </div>
        </div>
        <div className="mt-3">
          <Badge tone={mockMode ? "warning" : "neutral"}>{mockReasonLabel(mockReason, mockMode)}</Badge>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="ebay-app-id">App ID (Client ID)</Label>
          <Input
            id="ebay-app-id"
            value={appId}
            onChange={(event) => setAppId(event.target.value)}
            placeholder="Your eBay App ID (Client ID)"
            autoComplete="off"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ebay-cert-id">Cert ID (Client Secret)</Label>
          <div className="relative">
            <Input
              id="ebay-cert-id"
              type={showCert ? "text" : "password"}
              value={certId}
              onChange={(event) => setCertId(event.target.value)}
              placeholder={hasCertId ? "Saved — enter a new secret to replace it" : "Your eBay Cert ID (Client Secret)"}
              autoComplete="new-password"
              className="pr-11"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-zinc-100"
              onClick={() => setShowCert((value) => !value)}
              aria-label={showCert ? "Hide Cert ID" : "Show Cert ID"}
            >
              {showCert ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Environment</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["PRODUCTION", "SANDBOX"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEnvironment(value)}
                  className={
                    environment === value
                      ? "h-10 rounded-lg bg-amber-400 text-sm font-medium text-zinc-950"
                      : "h-10 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800"
                  }
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ebay-marketplace">Marketplace ID</Label>
            <Input
              id="ebay-marketplace-search"
              value={marketplaceQuery}
              onChange={(event) => setMarketplaceQuery(event.target.value)}
              placeholder="Search marketplace…"
            />
            <Select value={marketplaceId} onChange={(event) => setMarketplaceId(event.target.value)}>
              {(marketplaces.length ? marketplaces : EBAY_MARKETPLACES).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} ({item.label})
                </option>
              ))}
            </Select>
          </div>
        </div>

        <FieldError message={error} />

        {testResult ? (
          <Badge tone={testResult.success ? "success" : "danger"}>
            {testResult.success ? "Connected" : "Failed"} — {testResult.message}
          </Badge>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} loading={saving}>
            Save Configuration
          </Button>
          <Button variant="outline" onClick={testConnection} loading={testing}>
            Test eBay Connection
          </Button>
        </div>

        <button
          type="button"
          className="flex items-center gap-2 text-left text-sm text-zinc-400 hover:text-zinc-200"
          onClick={() => setHelpOpen((value) => !value)}
        >
          <Info className="h-4 w-4 shrink-0" />
          Need credentials?
          <ChevronDown className={`h-4 w-4 transition ${helpOpen ? "rotate-180" : ""}`} />
        </button>
        {helpOpen ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-400">
            Create a free eBay Developer account at{" "}
            <a
              href="https://developer.ebay.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 underline-offset-2 hover:underline"
            >
              developer.ebay.com
            </a>
            , create an Application Keyset, and paste your App ID &amp; Cert ID here.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function mockReasonLabel(reason: EbaySettingsResponse["mockReason"], enabled: boolean): string {
  if (!enabled) return "Live eBay API";
  if (reason === "env") return "Forced on via EBAY_MOCK_MODE";
  if (reason === "settings") return "Enabled in Settings";
  if (reason === "missing-credentials") return "Auto-on — eBay keys not configured";
  if (reason === "invalid-credentials") return "Fallback — credentials rejected";
  return "Mock catalog active";
}
