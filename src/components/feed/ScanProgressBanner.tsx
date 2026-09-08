"use client";

import { Radar } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ui/toast";
import { isScanRunning, useScanProgress } from "@/lib/use-scan-progress";

export function ScanProgressBanner() {
  const { push } = useToast();
  const progress = useScanProgress();
  const [holdComplete, setHoldComplete] = useState(false);
  const toastedAt = useRef<number | null>(null);

  const running = isScanRunning(progress);
  const finished = progress.status === "complete" || progress.status === "error";

  useEffect(() => {
    if (running) {
      setHoldComplete(true);
      return;
    }
    if (!finished || !progress.finishedAt) return;

    if (toastedAt.current !== progress.finishedAt) {
      toastedAt.current = progress.finishedAt;
      if (progress.status === "complete") {
        const count = progress.newDealsFound;
        push({
          tone: "success",
          title: "Scan complete",
          description: `Scan complete: ${count} new verified deal${count === 1 ? "" : "s"} found.`,
        });
      } else {
        push({
          tone: "error",
          title: "Scan failed",
          description: progress.error || "The scan stopped before it finished.",
        });
      }
    }

    const timeout = window.setTimeout(() => setHoldComplete(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [finished, progress.error, progress.finishedAt, progress.newDealsFound, progress.status, push, running]);

  if (!running && !holdComplete) return null;

  const total = Math.max(progress.total, progress.current, 0);
  const current = Math.min(progress.current, total || progress.current);
  const percent = running ? progress.percent : 100;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pt-4">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 shadow-lg ring-1 ring-white/10 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-950 shadow-sm ring-1 ring-white/10">
            <span className="radar-ring absolute inset-0 rounded-xl bg-amber-300/40" />
            <Radar className="radar-pulse relative h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-50">{progress.label}</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              {total > 0
                ? `${current} / ${total} listings inspected · ${progress.fetchedFromEbay} from eBay${
                    progress.aiEnabled ? ` · ${progress.passedAi} passed AI` : ""
                  }`
                : running
                  ? "Waiting for eBay search results…"
                  : "Scan finished"}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-zinc-400">{percent}%</span>
        </div>
      </div>
    </div>
  );
}
