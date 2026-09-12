"use client";

import { FlaskConical, Info } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import { DEFAULT_MIN_ARBITRAGE_DISCOUNT, MIN_ARBITRAGE_DISCOUNT_RANGE } from "@/lib/valuation/defaults";

interface EstimatorSettingsResponse {
  enabled: boolean;
  minDiscount: number;
  aiConfigured?: boolean;
}

export function ExperimentalSettingsCard() {
  const { push } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [minDiscount, setMinDiscount] = useState(String(DEFAULT_MIN_ARBITRAGE_DISCOUNT));
  const [aiConfigured, setAiConfigured] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<EstimatorSettingsResponse>("/api/settings/estimator")
      .then((data) => {
        setEnabled(Boolean(data.enabled));
        setMinDiscount(String(data.minDiscount ?? DEFAULT_MIN_ARBITRAGE_DISCOUNT));
        setAiConfigured(Boolean(data.aiConfigured));
      })
      .catch((err) => {
        push({
          tone: "error",
          title: "Could not load experimental settings",
          description: err instanceof ApiError ? err.message : undefined,
        });
      });
  }, [push]);

  async function save() {
    const discount = Number(minDiscount);
    if (!Number.isFinite(discount) || discount < MIN_ARBITRAGE_DISCOUNT_RANGE.min || discount > MIN_ARBITRAGE_DISCOUNT_RANGE.max) {
      setError(`Enter a discount between ${MIN_ARBITRAGE_DISCOUNT_RANGE.min} and ${MIN_ARBITRAGE_DISCOUNT_RANGE.max}.`);
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const result = await api<EstimatorSettingsResponse>("/api/settings/estimator", {
        method: "POST",
        body: JSON.stringify({ enabled, minDiscount: Math.round(discount) }),
      });
      setEnabled(Boolean(result.enabled));
      setMinDiscount(String(result.minDiscount));
      setAiConfigured(Boolean(result.aiConfigured));
      push({ tone: "success", title: "Experimental settings saved" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Save failed";
      setError(message);
      push({ tone: "error", title: "Save failed", description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="divide-y divide-white/[0.06] p-0">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-medium text-zinc-50">
              <FlaskConical className="h-4 w-4 text-amber-300" />
              Enable Price Estimator & Arbitrage Detector
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              Experimental: Estimates fair market value (FMV) and highlights profit margins. Valuation calls are
              capped to avoid blocking polling budgets.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={enabled ? (aiConfigured ? "warning" : "danger") : "neutral"}>
              {enabled ? (aiConfigured ? "Experimental" : "Needs AI") : "Off"}
            </Badge>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              label="Enable Price Estimator & Arbitrage Detector"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5">
        <div className="grid gap-1.5">
          <Label htmlFor="min-arbitrage-discount">Minimum Arbitrage Discount (%)</Label>
          <Input
            id="min-arbitrage-discount"
            type="number"
            min={MIN_ARBITRAGE_DISCOUNT_RANGE.min}
            max={MIN_ARBITRAGE_DISCOUNT_RANGE.max}
            step="1"
            value={minDiscount}
            onChange={(event) => setMinDiscount(event.target.value)}
          />
        </div>

        <FieldError message={error} />

        <Button onClick={() => void save()} loading={saving} className="w-fit">
          Save Experimental Settings
        </Button>

        <p className="flex items-start gap-2 text-sm text-zinc-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Uses the configured AI provider with a 4-second timeout per listing. Failed or slow estimates are skipped
            so Docker and Vercel pollers keep running.
          </span>
        </p>
      </div>
    </Card>
  );
}
