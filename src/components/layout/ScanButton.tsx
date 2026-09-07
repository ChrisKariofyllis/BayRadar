"use client";

import { Radar } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";

export function ScanButton({ compact = false }: { compact?: boolean }) {
  const { push } = useToast();
  const [loading, setLoading] = useState(false);

  async function triggerScan() {
    setLoading(true);
    try {
      const result = await api<{
        totalMonitors: number;
        newDealsFound: number;
        errors: Array<{ message: string }>;
      }>("/api/cron/poll", { method: "POST" });

      const extra = result.errors.length ? ` ${result.errors.length} error(s).` : "";
      push({
        tone: result.errors.length ? "info" : "success",
        title: "Scan complete",
        description: `${result.totalMonitors} monitors · ${result.newDealsFound} new deals.${extra}`,
      });
    } catch (error) {
      push({
        tone: "error",
        title: "Scan failed",
        description: error instanceof ApiError ? error.message : "Could not start a poll cycle.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={triggerScan} loading={loading} variant="secondary" size="sm">
      <Radar className="h-4 w-4" />
      <span className="hidden sm:inline">{compact ? "Trigger Scan" : "Trigger Scan"}</span>
    </Button>
  );
}
