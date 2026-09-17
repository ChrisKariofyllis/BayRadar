"use client";

import { ChevronDown, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  SettingsField,
  SettingsGroup,
  SettingsSecretToggle,
  SettingsStack,
} from "@/components/settings/SettingsGroup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <SettingsGroup
      footer={
        <>
          Stored in BayRadar&apos;s database. <code className="text-zinc-300">.env</code> values are used only as
          fallback.
        </>
      }
    >
      <div className="flex min-h-11 items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[17px] leading-5 text-zinc-50">Demo / mock engine</p>
          <p className="mt-1 text-[13px] leading-4 text-zinc-400">
            Exercise the full deal pipeline while the eBay app is under review. Listings are tagged{" "}
            <code className="text-zinc-300">[MOCK]</code>.
          </p>
          <div className="mt-2">
            <Badge tone={mockMode ? "warning" : "neutral"}>{mockReasonLabel(mockReason, mockMode)}</Badge>
          </div>
        </div>
        <Switch
          checked={mockMode}
          disabled={savingMock}
          onCheckedChange={toggleMock}
          label="Enable eBay mock mode"
        />
      </div>

      <SettingsStack>
        <SettingsField label="App ID (client ID)" htmlFor="ebay-app-id">
          <Input
            id="ebay-app-id"
            value={appId}
            onChange={(event) => setAppId(event.target.value)}
            placeholder="Your eBay App ID (client ID)"
            autoComplete="off"
          />
        </SettingsField>

        <SettingsField label="Cert ID (client secret)" htmlFor="ebay-cert-id">
          <div className="relative">
            <Input
              id="ebay-cert-id"
              type={showCert ? "text" : "password"}
              value={certId}
              onChange={(event) => setCertId(event.target.value)}
              placeholder={hasCertId ? "Saved — enter a new secret to replace it" : "Your eBay Cert ID (client secret)"}
              autoComplete="new-password"
              className="pr-11"
            />
            <SettingsSecretToggle
              revealed={showCert}
              onToggle={() => setShowCert((value) => !value)}
              hideLabel="Hide Cert ID"
              showLabel="Show Cert ID"
            />
          </div>
        </SettingsField>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-[13px] font-normal text-zinc-400">Environment</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["PRODUCTION", "SANDBOX"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={environment === value}
                  onClick={() => setEnvironment(value)}
                  className={
                    environment === value
                      ? "min-h-11 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 text-sm font-medium text-zinc-950 shadow-sm ring-1 ring-white/10"
                      : "min-h-11 rounded-xl border border-white/10 text-sm text-zinc-300 hover:bg-white/[0.05]"
                  }
                >
                  {value === "PRODUCTION" ? "Production" : "Sandbox"}
                </button>
              ))}
            </div>
          </div>
          <SettingsField label="Marketplace" htmlFor="ebay-marketplace-search">
            <Input
              id="ebay-marketplace-search"
              value={marketplaceQuery}
              onChange={(event) => setMarketplaceQuery(event.target.value)}
              placeholder="Search marketplace…"
            />
            <Select
              id="ebay-marketplace"
              aria-label="Marketplace ID"
              value={marketplaceId}
              onChange={(event) => setMarketplaceId(event.target.value)}
            >
              {(marketplaces.length ? marketplaces : EBAY_MARKETPLACES).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} ({item.label})
                </option>
              ))}
            </Select>
          </SettingsField>
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

        <button
          type="button"
          className="flex min-h-11 items-center gap-2 text-left text-sm text-zinc-400 hover:text-zinc-200"
          onClick={() => setHelpOpen((value) => !value)}
        >
          <Info className="h-4 w-4 shrink-0" />
          Need credentials?
          <ChevronDown className={`h-4 w-4 transition ${helpOpen ? "rotate-180" : ""}`} />
        </button>
        {helpOpen ? (
          <p className="text-[13px] leading-5 text-zinc-400">
            Create a free eBay developer account at{" "}
            <a
              href="https://developer.ebay.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 underline-offset-2 hover:underline"
            >
              developer.ebay.com
            </a>
            , create an application keyset, and paste your App ID and Cert ID here.
          </p>
        ) : null}
      </SettingsStack>
    </SettingsGroup>
  );
}

function mockReasonLabel(reason: EbaySettingsResponse["mockReason"], enabled: boolean): string {
  if (!enabled) return "Live eBay API";
  if (reason === "env") return "Forced on via EBAY_MOCK_MODE";
  if (reason === "settings") return "Enabled in settings";
  if (reason === "missing-credentials") return "Auto-on — eBay keys not configured";
  if (reason === "invalid-credentials") return "Fallback — credentials rejected";
  return "Mock catalog active";
}
