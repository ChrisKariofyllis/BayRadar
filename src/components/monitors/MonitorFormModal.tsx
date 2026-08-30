"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CRON_PRESETS } from "@/lib/format-ui";
import type { BuyingType, Monitor } from "@/lib/types";

export interface MonitorFormValues {
  name: string;
  query: string;
  categoryId: string;
  maxPrice: string;
  buyingType: BuyingType;
  maxRemainingHours: string;
  negativeKeywords: string;
  cronSchedule: string;
}

export function valuesFromMonitor(monitor?: Monitor | null): MonitorFormValues {
  return {
    name: monitor?.name ?? "",
    query: monitor?.query ?? "",
    categoryId: monitor?.categoryId ?? "",
    maxPrice: monitor ? String(monitor.maxPrice) : "",
    buyingType: monitor?.buyingType ?? "ALL",
    maxRemainingHours: monitor?.maxRemainingHours != null ? String(monitor.maxRemainingHours) : "",
    negativeKeywords: monitor ? parseKeywordsInput(monitor.negativeKeywords) : "",
    cronSchedule: monitor?.cronSchedule ?? "*/15 * * * *",
  };
}

export function MonitorFormModal({
  open,
  monitor,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  monitor?: Monitor | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [values, setValues] = useState<MonitorFormValues>(valuesFromMonitor(monitor));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = Boolean(monitor);

  useEffect(() => {
    if (open) {
      setValues(valuesFromMonitor(monitor));
      setErrors({});
    }
  }, [open, monitor]);

  function update<K extends keyof MonitorFormValues>(key: K, value: MonitorFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    await onSubmit({
      name: values.name.trim(),
      query: values.query.trim(),
      categoryId: values.categoryId.trim() || null,
      maxPrice: Number(values.maxPrice),
      buyingType: values.buyingType,
      maxRemainingHours: values.maxRemainingHours ? Number(values.maxRemainingHours) : null,
      negativeKeywords: values.negativeKeywords
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      cronSchedule: values.cronSchedule,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit monitor" : "Create monitor"}
      description="Define the eBay search, price cap, and filters BayRadar should watch."
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <Field label="Monitor name" error={errors.name}>
          <Input
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder='PS5 Digital under 350€'
          />
        </Field>
        <Field label="Search query" error={errors.query}>
          <Input
            value={values.query}
            onChange={(event) => update("query", event.target.value)}
            placeholder="PS5 Digital Edition"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category ID (optional)">
            <Input
              value={values.categoryId}
              onChange={(event) => update("categoryId", event.target.value)}
              placeholder="139973"
            />
          </Field>
          <Field label="Max target price (€)" error={errors.maxPrice}>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={values.maxPrice}
              onChange={(event) => update("maxPrice", event.target.value)}
              placeholder="350"
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Buying type">
            <Select value={values.buyingType} onChange={(event) => update("buyingType", event.target.value as BuyingType)}>
              <option value="ALL">ALL</option>
              <option value="AUCTION">AUCTION</option>
              <option value="FIXED_PRICE">FIXED_PRICE</option>
            </Select>
          </Field>
          <Field label="Max remaining auction hours" error={errors.maxRemainingHours}>
            <Input
              type="number"
              min="1"
              step="1"
              value={values.maxRemainingHours}
              onChange={(event) => update("maxRemainingHours", event.target.value)}
              placeholder="24"
            />
          </Field>
        </div>
        <Field label="Negative keywords" error={errors.negativeKeywords}>
          <Input
            value={values.negativeKeywords}
            onChange={(event) => update("negativeKeywords", event.target.value)}
            placeholder="ovp, defekt, box only"
          />
        </Field>
        <Field label="Polling schedule">
          <Select value={values.cronSchedule} onChange={(event) => update("cronSchedule", event.target.value)}>
            {CRON_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
            {CRON_PRESETS.some((preset) => preset.value === values.cronSchedule) ? null : (
              <option value={values.cronSchedule}>{values.cronSchedule}</option>
            )}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? "Save changes" : "Create monitor"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

function validate(values: MonitorFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.name.trim()) errors.name = "Name is required.";
  if (!values.query.trim()) errors.query = "Search query is required.";
  const price = Number(values.maxPrice);
  if (!values.maxPrice || !Number.isFinite(price) || price <= 0) {
    errors.maxPrice = "Enter a price greater than 0.";
  }
  if (values.maxRemainingHours) {
    const hours = Number(values.maxRemainingHours);
    if (!Number.isInteger(hours) || hours <= 0) {
      errors.maxRemainingHours = "Use a positive whole number.";
    }
  }
  return errors;
}

function parseKeywordsInput(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.join(", ");
  } catch {
    return raw;
  }
  return raw;
}
