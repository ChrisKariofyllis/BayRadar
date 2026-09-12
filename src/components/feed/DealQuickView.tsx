"use client";

import { Clock3, Crosshair, ExternalLink, ImageOff, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import {
  formatCountdown,
  formatDateTime,
  formatEuro,
  formatEuroAmount,
  formatShipping,
  isAuctionListing,
  listingActiveSnipe,
  listingCardFormatLabel,
} from "@/lib/format-ui";
import type { ListingSnipe, SeenListing } from "@/lib/types";

const INCREMENTS = [1, 5, 10] as const;

export function DealQuickView({
  listing,
  open,
  focusBid,
  onClose,
  onSnipeUpdated,
}: {
  listing: SeenListing | null;
  open: boolean;
  focusBid?: boolean;
  onClose: () => void;
  onSnipeUpdated?: (listingId: string, snipe: ListingSnipe | null) => void;
}) {
  const titleId = useId();
  const { push } = useToast();
  const bidRef = useRef<HTMLInputElement>(null);
  const [cached, setCached] = useState<SeenListing | null>(listing);
  const [countdown, setCountdown] = useState<string | null>(listing ? formatCountdown(listing.endsAt) : null);
  const [maxBid, setMaxBid] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [formError, setFormError] = useState<string>();

  useEffect(() => {
    if (listing) setCached(listing);
  }, [listing]);

  const active = listing ?? cached;
  const auction = active ? isAuctionListing(active) : false;
  const snipe = active ? listingActiveSnipe(active) : null;

  useEffect(() => {
    if (!active) return;
    setMaxBid(snipe?.maxBid != null ? String(snipe.maxBid) : String(active.price || ""));
    setFormError(undefined);
  }, [active?.id, active?.price, snipe?.id, snipe?.maxBid]);

  useEffect(() => {
    if (!active?.endsAt) {
      setCountdown("");
      return;
    }
    const tick = () => setCountdown(formatCountdown(active.endsAt));
    tick();
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, [active?.id, active?.endsAt]);

  useEffect(() => {
    if (!open || !focusBid || !auction) return;
    const frame = window.requestAnimationFrame(() => bidRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, focusBid, auction, active?.id]);

  function bump(delta: number) {
    const current = Number(maxBid);
    const base = Number.isFinite(current) && current > 0 ? current : active?.price ?? 0;
    setMaxBid((base + delta).toFixed(2));
  }

  async function armSnipe() {
    if (!active) return;
    const bid = Number(maxBid);
    if (!Number.isFinite(bid) || bid <= 0) {
      setFormError("Enter a max bid greater than 0.");
      return;
    }
    setFormError(undefined);
    setSubmitting(true);
    try {
      const result = await api<{
        success: boolean;
        snipeId?: string;
        error?: string;
        snipe?: ListingSnipe;
      }>("/api/snipe", {
        method: "POST",
        body: JSON.stringify({
          listingId: active.id,
          maxBid: bid,
          title: active.title,
          endsAt: active.endsAt ?? undefined,
        }),
      });

      if (result.snipe) {
        onSnipeUpdated?.(active.id, result.snipe);
        setCached((current) =>
          current
            ? { ...current, snipeTask: result.snipe, activeSnipe: listingActiveSnipe({ snipeTask: result.snipe }) }
            : current,
        );
      }

      if (!result.success) {
        const message = result.error || "Gixen rejected the snipe.";
        setFormError(message);
        push({ tone: "error", title: "Snipe failed", description: message });
        return;
      }

      push({
        tone: "success",
        title: "Snipe armed",
        description: `Gixen will bid up to ${formatEuro(bid, active.currency)}.`,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Could not schedule snipe.";
      setFormError(message);
      push({ tone: "error", title: "Snipe failed", description: message });
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelArmedSnipe() {
    if (!active || !snipe) return;
    setFormError(undefined);
    setCancelling(true);
    try {
      const result = await api<{
        success: boolean;
        error?: string;
        snipe?: ListingSnipe;
      }>("/api/snipe", {
        method: "DELETE",
        body: JSON.stringify({ listingId: active.id }),
      });

      const next = result.snipe ?? null;
      onSnipeUpdated?.(active.id, next);
      setCached((current) =>
        current ? { ...current, snipeTask: next, activeSnipe: listingActiveSnipe({ snipeTask: next }) } : current,
      );

      if (!result.success) {
        const message = result.error || "Gixen did not remove the snipe.";
        setFormError(message);
        push({ tone: "error", title: "Cancel failed", description: message });
        return;
      }

      push({
        tone: "success",
        title: "Snipe cancelled",
        description: "The Gixen snipe was removed.",
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Could not cancel snipe.";
      setFormError(message);
      push({ tone: "error", title: "Cancel failed", description: message });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      {active ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 px-4 pb-3 md:pt-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {listingCardFormatLabel(active)}
              </p>
              <h2 id={titleId} className="mt-1 text-lg font-semibold leading-snug text-zinc-50">
                {active.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <div className="overflow-hidden rounded-xl bg-zinc-900">
              {active.imageUrl ? (
                // eBay CDN URLs vary; native img avoids remotePatterns config.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={active.imageUrl} alt="" className="max-h-64 w-full object-contain md:max-h-80" />
              ) : (
                <div className="flex h-48 items-center justify-center text-zinc-600">
                  <ImageOff className="h-10 w-10" />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-2xl font-semibold tabular-nums text-zinc-50">
                {formatEuro(active.price, active.currency)}
              </p>
              <p className="text-sm text-zinc-400">
                {formatShipping(active.shippingCost, active.shippingCurrency ?? active.currency)}
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-300">
              {active.endsAt ? (
                <div className="flex items-start gap-2">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div>
                    {countdown ? <p className="font-medium text-amber-100">{countdown} remaining</p> : null}
                    <p className="text-zinc-400">Ends {formatDateTime(active.endsAt)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-zinc-500">No end date listed</p>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 space-y-3 border-t border-white/[0.08] bg-[#18181b] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {auction ? (
              <>
                {snipe ? (
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
                    Active Snipe: €{formatEuroAmount(snipe.maxBid)}
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  <Label htmlFor={`quick-max-bid-${active.id}`}>Max Bid (€)</Label>
                  <Input
                    ref={bidRef}
                    id={`quick-max-bid-${active.id}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={maxBid}
                    onChange={(event) => setMaxBid(event.target.value)}
                    placeholder="0.00"
                    className="h-12 text-base"
                  />
                  <div className="flex gap-2">
                    {INCREMENTS.map((amount) => (
                      <Button
                        key={amount}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => bump(amount)}
                      >
                        +€{amount}
                      </Button>
                    ))}
                  </div>
                </div>
                <FieldError message={formError} />
                <div className="flex flex-col gap-2 sm:flex-row">
                  {snipe ? (
                    <Button
                      type="button"
                      variant="danger"
                      size="lg"
                      className="w-full sm:flex-1"
                      loading={cancelling}
                      disabled={submitting}
                      onClick={() => void cancelArmedSnipe()}
                    >
                      Cancel Snipe
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="lg"
                    className="w-full sm:flex-1"
                    loading={submitting}
                    disabled={cancelling}
                    onClick={() => void armSnipe()}
                  >
                    <Crosshair className="h-4 w-4" />
                    {snipe ? "Update Snipe (Gixen)" : "Arm Snipe (Gixen)"}
                  </Button>
                </div>
              </>
            ) : null}

            <a
              href={active.itemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-transparent text-base font-medium text-zinc-100 transition-colors hover:bg-white/[0.05]"
            >
              <ExternalLink className="h-4 w-4" />
              Open on eBay
            </a>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
