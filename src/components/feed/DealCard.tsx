"use client";

import { Clock3, Crosshair, Gavel, ImageOff, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { listingSnipeCardClass, SnipeStatusBadge } from "@/components/feed/SnipeStatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  formatCountdown,
  formatDateTime,
  formatEuro,
  formatEuroAmount,
  isAuctionListing,
  listingCardFormatLabel,
  listingSnipeState,
} from "@/lib/format-ui";
import type { SeenListing } from "@/lib/types";

const BADGE_BASE =
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium tracking-wide backdrop-blur-md";

export function DealCard({
  listing,
  onOpen,
}: {
  listing: SeenListing;
  onOpen: (listing: SeenListing, intent?: "snipe") => void;
}) {
  const auction = isAuctionListing(listing);
  const [countdown, setCountdown] = useState(formatCountdown(listing.endsAt));
  const snipe = listingSnipeState(listing);
  const canArm = auction && (!snipe || snipe.kind === "armed");

  useEffect(() => {
    if (!listing.endsAt) return;
    const tick = () => setCountdown(formatCountdown(listing.endsAt));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [listing.endsAt]);

  return (
    <Card className={cn("overflow-hidden", listingSnipeCardClass(listing))}>
      <button
        type="button"
        onClick={() => onOpen(listing)}
        className="group relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-zinc-900 text-left"
      >
        {listing.imageUrl ? (
          // eBay CDN URLs vary; native img avoids remotePatterns config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.imageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600 transition-transform duration-200 group-hover:scale-[1.02]">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-3 flex w-full items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className={`${BADGE_BASE} border border-white/15 bg-black/40 text-zinc-100`}>
              {listingCardFormatLabel(listing)}
            </span>
            {listing.aiVerified ? (
              <span
                title={listing.aiVerificationReason || "AI verified this listing as the genuine product"}
                className={`${BADGE_BASE} border border-purple-400/35 bg-purple-950/40 text-purple-200 shadow-sm shadow-purple-950/50`}
              >
                <Sparkles className="size-3 shrink-0 text-purple-300" />
                <span className="select-none">AI Verified</span>
              </span>
            ) : null}
            <SnipeStatusBadge listing={listing} />
          </div>
          <span className={`${BADGE_BASE} border border-white/15 bg-black/40 tabular-nums text-zinc-50`}>
            {formatEuro(listing.price, listing.currency)}
          </span>
        </div>
        {auction && countdown ? (
          <div className="pointer-events-none absolute bottom-3 left-3">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/45 px-2 py-0.5 text-xs text-amber-100 backdrop-blur-md">
              <Clock3 className="h-3 w-3" />
              {countdown}
            </span>
          </div>
        ) : null}
      </button>
      <div className="space-y-3 p-4">
        <button
          type="button"
          onClick={() => onOpen(listing)}
          className="line-clamp-2 w-full cursor-pointer text-left font-medium text-zinc-50 transition-colors hover:text-amber-200"
        >
          {listing.title}
        </button>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          {auction && listing.bidCount != null ? (
            <span className="inline-flex items-center gap-1">
              <Gavel className="h-3 w-3" />
              <span className="tabular-nums">{listing.bidCount} bids</span>
            </span>
          ) : null}
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">{listing.monitor.name}</span>
          <span className="ml-auto tabular-nums text-zinc-500">{formatDateTime(listing.createdAt)}</span>
        </div>
        {canArm ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onOpen(listing, "snipe")}>
              <Crosshair className="h-3.5 w-3.5" />
              {snipe?.kind === "armed" ? "Update Snipe" : "Set Snipe"}
            </Button>
            {snipe?.kind === "armed" ? (
              <span className="text-xs text-emerald-300">Armed · €{formatEuroAmount(snipe.maxBid)}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
