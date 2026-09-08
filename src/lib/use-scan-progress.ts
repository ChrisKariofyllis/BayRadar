"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api-client";
import type { ScanProgress } from "@/lib/types";

const IDLE: ScanProgress = {
  status: "idle",
  label: "Idle",
  current: 0,
  total: 0,
  percent: 0,
  newDealsFound: 0,
  fetchedFromEbay: 0,
  passedAi: 0,
  aiRejected: 0,
  aiEnabled: false,
  monitorName: null,
  startedAt: null,
  finishedAt: null,
  error: null,
};

export function isScanRunning(progress: ScanProgress): boolean {
  return progress.status === "fetching" || progress.status === "analyzing";
}

export function useScanProgress(): ScanProgress {
  const [progress, setProgress] = useState<ScanProgress>(IDLE);

  useEffect(() => {
    let cancelled = false;

    function apply(next: ScanProgress) {
      if (!cancelled && next?.status) setProgress(next);
    }

    async function poll() {
      try {
        const next = await api<ScanProgress>("/api/scan/progress");
        apply(next);
      } catch {
        // progress endpoint is best-effort
      }
    }

    const source = new EventSource("/api/scan/stream");
    source.onmessage = (event) => {
      try {
        apply(JSON.parse(event.data) as ScanProgress);
      } catch {
        // ignore malformed frames
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 1000);

    return () => {
      cancelled = true;
      source.close();
      window.clearInterval(interval);
    };
  }, []);

  return progress;
}
