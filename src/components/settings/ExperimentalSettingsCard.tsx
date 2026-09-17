"use client";

import { useEffect, useState } from "react";

import { SettingsField, SettingsGroup, SettingsStack } from "@/components/settings/SettingsGroup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";
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

  async function persistEnabled(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    const discount = Number(minDiscount);
    const safeDiscount =
      Number.isFinite(discount) &&
      discount >= MIN_ARBITRAGE_DISCOUNT_RANGE.min &&
      discount <= MIN_ARBITRAGE_DISCOUNT_RANGE.max
        ? Math.round(discount)
        : DEFAULT_MIN_ARBITRAGE_DISCOUNT;
    try {
      const result = await api<EstimatorSettingsResponse>("/api/settings/estimator", {
        method: "POST",
        body: JSON.stringify({ enabled: next, minDiscount: safeDiscount }),
      });
      setEnabled(Boolean(result.enabled));
      setMinDiscount(String(result.minDiscount));
      setAiConfigured(Boolean(result.aiConfigured));
    } catch (err) {
      setEnabled(previous);
      push({
        tone: "error",
        title: "Could not update estimator",
        description: err instanceof ApiError ? err.message : undefined,
      });
    }
  }

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
    <SettingsGroup
      footer="Uses the configured AI provider with a 4-second timeout per listing. Failed or slow estimates are skipped so Docker and Vercel pollers keep running."
    >
      <div className="flex min-h-11 items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[17px] leading-5 text-zinc-50">Price estimator and arbitrage detector</p>
          <p className="mt-1 text-[13px] leading-4 text-zinc-400">
            Estimates fair market value and highlights profit margins. Valuation calls are capped so they do not block
            polling.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={enabled ? (aiConfigured ? "warning" : "danger") : "neutral"}>
            {enabled ? (aiConfigured ? "Experimental" : "Needs AI") : "Off"}
          </Badge>
          <Switch
            checked={enabled}
            onCheckedChange={(next) => void persistEnabled(next)}
            label="Enable price estimator and arbitrage detector"
          />
        </div>
      </div>

      <SettingsStack>
        <SettingsField label="Minimum arbitrage discount (%)" htmlFor="min-arbitrage-discount">
          <Input
            id="min-arbitrage-discount"
            type="number"
            min={MIN_ARBITRAGE_DISCOUNT_RANGE.min}
            max={MIN_ARBITRAGE_DISCOUNT_RANGE.max}
            step="1"
            value={minDiscount}
            onChange={(event) => setMinDiscount(event.target.value)}
          />
        </SettingsField>

        <FieldError message={error} />

        <Button className="min-h-11 w-fit" onClick={() => void save()} loading={saving}>
          Save
        </Button>
      </SettingsStack>
    </SettingsGroup>
  );
}
