"use client";

import { Radar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import { useState } from "react";

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
    <Button onClick={triggerScan} loading={loading} size={compact ? "sm" : "md"}>
      <Radar className="h-4 w-4" />
      {compact ? "Scan" : "Trigger Scan Now"}
    </Button>
  );
}
