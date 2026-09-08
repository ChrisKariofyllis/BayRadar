"use client";

import { Radar } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import { isScanRunning, useScanProgress } from "@/lib/use-scan-progress";

export function ScanButton({ compact = false }: { compact?: boolean }) {
  const { push } = useToast();
  const progress = useScanProgress();
  const [starting, setStarting] = useState(false);
  const loading = starting || isScanRunning(progress);

  async function triggerScan() {
    if (loading) return;
    setStarting(true);
    try {
      await api("/api/cron/poll", { method: "POST", body: JSON.stringify({ reset: true }) });
    } catch (error) {
      push({
        tone: "error",
        title: "Scan failed",
        description: error instanceof ApiError ? error.message : "Could not start a poll cycle.",
      });
    } finally {
      setStarting(false);
    }
  }

  return (
    <Button onClick={() => void triggerScan()} loading={loading} variant="secondary" size="sm">
      <Radar className="h-4 w-4" />
      <span className="hidden sm:inline">{compact ? "Trigger Scan" : "Trigger Scan"}</span>
    </Button>
  );
}
