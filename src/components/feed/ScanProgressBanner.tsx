"use client";

import { AlertTriangle, Radar } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { isScanRunning, useScanProgress } from "@/lib/use-scan-progress";

export function ScanProgressBanner() {
  const { push } = useToast();
  const router = useRouter();
  const progress = useScanProgress();
  const [holdComplete, setHoldComplete] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quotaBanner, setQuotaBanner] = useState(false);
  const toastedAt = useRef<number | null>(null);
  const quotaShownAt = useRef<number | null>(null);

  const running = isScanRunning(progress);
  const finished = progress.status === "complete" || progress.status === "error";
  const quotaHit = progress.errorType === "QUOTA_EXHAUSTED" || progress.errorType === "RATE_LIMIT";

  useEffect(() => {
    if (running) {
      setHoldComplete(true);
      return;
    }
    if (!finished || !progress.finishedAt) return;

    if (toastedAt.current !== progress.finishedAt) {
      toastedAt.current = progress.finishedAt;
      if (quotaHit) {
        setQuotaBanner(true);
        if (quotaShownAt.current !== progress.finishedAt) {
          quotaShownAt.current = progress.finishedAt;
          setQuotaOpen(true);
        }
      } else if (progress.status === "complete") {
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

    if (quotaHit) return;
    const timeout = window.setTimeout(() => setHoldComplete(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [
    finished,
    progress.error,
    progress.finishedAt,
    progress.newDealsFound,
    progress.status,
    push,
    quotaHit,
    running,
  ]);

  const showQuota = quotaHit && (running || holdComplete || quotaBanner);
  if (!running && !holdComplete && !quotaBanner) return null;

  const total = Math.max(progress.total, progress.current, 0);
  const current = Math.min(progress.current, total || progress.current);
  const percent = running ? progress.percent : 100;

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-6 pt-4">
        <div
          className={
            showQuota
              ? "overflow-hidden rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 shadow-lg ring-1 ring-amber-400/15 backdrop-blur-xl"
              : "overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 shadow-lg ring-1 ring-white/10 backdrop-blur-xl"
          }
        >
          <div className="flex items-start gap-3">
            <span
              className={
                showQuota
                  ? "relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/20"
                  : "relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-950 shadow-sm ring-1 ring-white/10"
              }
            >
              {showQuota ? (
                <AlertTriangle className="relative h-4 w-4" />
              ) : (
                <>
                  <span className="radar-ring absolute inset-0 rounded-xl bg-amber-300/40" />
                  <Radar className="radar-pulse relative h-4 w-4" />
                </>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-50">
                {showQuota
                  ? "⚠️ AI Evaluation Paused: Daily quota reached on your AI provider. Falling back to basic filters."
                  : progress.label}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {showQuota
                  ? progress.error || "AI provider quota (RPD/RPM) has been exceeded."
                  : total > 0
                    ? `${current} / ${total} listings inspected · ${progress.fetchedFromEbay} from eBay${
                        progress.aiEnabled ? ` · ${progress.passedAi} passed AI` : ""
                      }`
                    : running
                      ? "Waiting for eBay search results…"
                      : "Scan finished"}
              </p>
              {showQuota ? null : (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-[width] duration-300 ease-out"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
            </div>
            {showQuota ? (
              <button
                type="button"
                className="cursor-pointer text-xs font-medium text-amber-200/80 hover:text-amber-100"
                onClick={() => {
                  setQuotaBanner(false);
                  setHoldComplete(false);
                }}
              >
                Dismiss
              </button>
            ) : (
              <span className="shrink-0 text-xs font-medium tabular-nums text-zinc-400">{percent}%</span>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={quotaOpen}
        title="AI Rate Limit Reached"
        description="Your configured AI provider has exhausted its requests per day (RPD) or minute (RPM). Please update your model in Settings, activate a fallback model, or wait for the quota window to reset."
        onClose={() => setQuotaOpen(false)}
      >
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setQuotaOpen(false);
              router.push("/settings");
            }}
          >
            Go to Settings
          </Button>
        </div>
      </Modal>
    </>
  );
}
