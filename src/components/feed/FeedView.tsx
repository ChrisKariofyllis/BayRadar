"use client";

import { Crosshair, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DealCard } from "@/components/feed/DealCard";
import { DealQuickView } from "@/components/feed/DealQuickView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import { listingActiveSnipe, toActiveSnipe } from "@/lib/format-ui";
import type { ListingSnipe, Monitor, SeenListing } from "@/lib/types";
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
  const [sort, setSort] = useState("newest");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusBid, setFocusBid] = useState(false);
  const [view, setView] = useState<"all" | "snipes">("all");
  const [snipeCount, setSnipeCount] = useState(0);

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
    if (sort) params.set("sort", sort);
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (view === "snipes") params.set("snipes", "active");
    setLoading(true);
    api<{ listings: SeenListing[]; activeSnipeCount?: number }>(`/api/feed?${params.toString()}`)
      .then((data) => {
        setListings(data.listings);
        if (typeof data.activeSnipeCount === "number") setSnipeCount(data.activeSnipeCount);
      })
      .catch((error) => {
        push({
          tone: "error",
          title: "Could not load deals",
          description: error instanceof ApiError ? error.message : undefined,
        });
      })
      .finally(() => setLoading(false));
  }, [monitorId, format, sort, debouncedQuery, view, push]);

  useEffect(() => {
    if (scan.status === "idle") return;
    const params = new URLSearchParams();
    if (monitorId) params.set("monitorId", monitorId);
    if (format) params.set("format", format);
    if (sort) params.set("sort", sort);
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (view === "snipes") params.set("snipes", "active");

    const refresh = () => {
      api<{ listings: SeenListing[]; activeSnipeCount?: number }>(`/api/feed?${params.toString()}`)
        .then((data) => {
          setListings(data.listings);
          if (typeof data.activeSnipeCount === "number") setSnipeCount(data.activeSnipeCount);
        })
        .catch(() => undefined);
    };

    refresh();
    if (!isScanRunning(scan)) return;
    const interval = window.setInterval(refresh, 2500);
    return () => window.clearInterval(interval);
  }, [debouncedQuery, format, monitorId, scan.status, scan.finishedAt, sort, view]);

  const visible = useMemo(
    () => (view === "snipes" ? listings.filter((listing) => listingActiveSnipe(listing)) : listings),
    [listings, view],
  );
  const empty = useMemo(() => !loading && visible.length === 0, [loading, visible.length]);
  const selected = listings.find((listing) => listing.id === selectedId) ?? visible.find((listing) => listing.id === selectedId) ?? null;

  function openListing(listing: SeenListing, intent?: "snipe") {
    setSelectedId(listing.id);
    setFocusBid(intent === "snipe");
  }

  function closeListing() {
    setSelectedId(null);
    setFocusBid(false);
  }

  function handleSnipeUpdated(listingId: string, snipe: ListingSnipe | null) {
    setListings((current) => {
      const previous = current.find((listing) => listing.id === listingId);
      const wasActive = Boolean(previous && listingActiveSnipe(previous));
      const nextActive = toActiveSnipe(snipe);
      if (wasActive !== Boolean(nextActive)) {
        setSnipeCount((count) => Math.max(0, count + (nextActive ? 1 : -1)));
      }
      return current.map((listing) =>
        listing.id === listingId ? { ...listing, snipeTask: snipe, activeSnipe: nextActive } : listing,
      );
    });
  }

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
          <p className="mt-1 text-sm text-zinc-400">Matched listings saved from your monitors.</p>
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setView("all")}
          className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-medium transition-colors ${
            view === "all"
              ? "bg-amber-400 text-zinc-950"
              : "border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
          }`}
        >
          All Deals
        </button>
        <button
          type="button"
          onClick={() => setView("snipes")}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors ${
            view === "snipes"
              ? "bg-amber-400 text-zinc-950"
              : "border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
          }`}
        >
          <Crosshair className="h-3.5 w-3.5" />
          Active Snipes
          <span
            className={`rounded-full px-1.5 text-xs tabular-nums ${
              view === "snipes" ? "bg-zinc-950/15" : "bg-white/10 text-zinc-200"
            }`}
          >
            {snipeCount}
          </span>
        </button>
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort deals">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="ending_soon">Ending: Soonest first</option>
          <option value="ending_late">Ending: Latest first</option>
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
          {view === "snipes"
            ? "No active snipes scheduled yet."
            : "No deals yet. Run a scan after creating an active monitor."}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((listing) => (
            <DealCard key={listing.id} listing={listing} onOpen={openListing} />
          ))}
        </div>
      )}

      <DealQuickView
        listing={selected}
        open={Boolean(selectedId)}
        focusBid={focusBid}
        onClose={closeListing}
        onSnipeUpdated={handleSnipeUpdated}
      />

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
