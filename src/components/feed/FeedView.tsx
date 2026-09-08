"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DealCard } from "@/components/feed/DealCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import type { Monitor, SeenListing } from "@/lib/types";
import { isScanRunning, useScanProgress } from "@/lib/use-scan-progress";

export function FeedView() {
  const { push } = useToast();
  const scan = useScanProgress();
  const [listings, setListings] = useState<SeenListing[]>([]);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [monitorId, setMonitorId] = useState("");
  const [format, setFormat] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    api<{ monitors: Monitor[] }>("/api/monitors")
      .then((data) => setMonitors(data.monitors))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (monitorId) params.set("monitorId", monitorId);
    if (format) params.set("format", format);
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    setLoading(true);
    api<{ listings: SeenListing[] }>(`/api/feed?${params.toString()}`)
      .then((data) => setListings(data.listings))
      .catch((error) => {
        push({
          tone: "error",
          title: "Could not load deals",
          description: error instanceof ApiError ? error.message : undefined,
        });
      })
      .finally(() => setLoading(false));
  }, [monitorId, format, debouncedQuery, push]);

  useEffect(() => {
    if (scan.status === "idle") return;
    const params = new URLSearchParams();
    if (monitorId) params.set("monitorId", monitorId);
    if (format) params.set("format", format);
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());

    const refresh = () => {
      api<{ listings: SeenListing[] }>(`/api/feed?${params.toString()}`)
        .then((data) => setListings(data.listings))
        .catch(() => undefined);
    };

    refresh();
    if (!isScanRunning(scan)) return;
    const interval = window.setInterval(refresh, 2500);
    return () => window.clearInterval(interval);
  }, [debouncedQuery, format, monitorId, scan.status, scan.finishedAt]);

  const empty = useMemo(() => !loading && listings.length === 0, [loading, listings.length]);

  async function clearFeed() {
    setClearing(true);
    try {
      const result = await api<{ success: boolean; count: number }>("/api/feed", { method: "DELETE" });
      setListings([]);
      setConfirmClear(false);
      push({
        tone: "success",
        title: "Feed cleared",
        description: `Removed ${result.count} deal${result.count === 1 ? "" : "s"}. The next scan will refill matches.`,
      });
    } catch (error) {
      push({
        tone: "error",
        title: "Could not clear feed",
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Deals Feed</h1>
          <p className="mt-1 text-sm text-zinc-400">Matched listings saved from your monitors, newest first.</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmClear(true)}
          className="text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
          Clear Feed
        </Button>
      </div>

      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <Select value={monitorId} onChange={(event) => setMonitorId(event.target.value)} aria-label="Filter by monitor">
          <option value="">All monitors</option>
          {monitors.map((monitor) => (
            <option key={monitor.id} value={monitor.id}>
              {monitor.name}
            </option>
          ))}
        </Select>
        <Select value={format} onChange={(event) => setFormat(event.target.value)} aria-label="Filter by format">
          <option value="">All formats</option>
          <option value="AUCTION">Auction</option>
          <option value="FIXED_PRICE">Buy It Now</option>
        </Select>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search keywords in titles"
          aria-label="Search deals"
        />
      </Card>

      {loading ? <p className="text-sm text-zinc-500">Loading deals…</p> : null}
      {empty ? (
        <Card className="p-8 text-center text-sm text-zinc-400">
          No deals yet. Run a scan after creating an active monitor.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <DealCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      <Modal
        open={confirmClear}
        title="Clear all deals?"
        description="This will empty your feed until the next scan."
        onClose={() => setConfirmClear(false)}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmClear(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={clearing} onClick={() => void clearFeed()}>
            Clear Feed
          </Button>
        </div>
      </Modal>
    </div>
  );
}
