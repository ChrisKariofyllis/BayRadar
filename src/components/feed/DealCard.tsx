"use client";

import { Clock3, ExternalLink, Gavel, ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { formatCountdown, formatDateTime, formatEuro, isAuctionFormat, listingFormatLabel } from "@/lib/format-ui";
import type { SeenListing } from "@/lib/types";

export function DealCard({ listing }: { listing: SeenListing }) {
  const auction = isAuctionFormat(listing.buyingFormat);
  const [countdown, setCountdown] = useState(formatCountdown(listing.endsAt));

  useEffect(() => {
    if (!auction || !listing.endsAt) return;
    const tick = () => setCountdown(formatCountdown(listing.endsAt));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [auction, listing.endsAt]);

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[4/3] bg-zinc-900">
        {listing.imageUrl ? (
          // eBay CDN URLs vary; native img avoids remotePatterns config.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-xs text-zinc-100 backdrop-blur-md">
            {listingFormatLabel(listing.buyingFormat)}
          </span>
          {listing.aiVerified ? (
            <span
              title={listing.aiVerificationReason || "AI verified this listing as the genuine product"}
              className="inline-flex items-center gap-1 rounded-full border border-violet-300/25 bg-violet-500/20 px-2 py-0.5 text-xs text-violet-100 backdrop-blur-md"
            >
              ✨ AI Verified
            </span>
          ) : null}
        </div>
        <div className="absolute right-3 top-3">
          <span className="rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-sm font-medium tabular-nums text-zinc-50 backdrop-blur-md">
            {formatEuro(listing.price, listing.currency)}
          </span>
        </div>
        {auction && countdown ? (
          <div className="absolute bottom-3 left-3">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/45 px-2 py-0.5 text-xs text-amber-100 backdrop-blur-md">
              <Clock3 className="h-3 w-3" />
              {countdown}
            </span>
          </div>
        ) : null}
      </div>
      <div className="space-y-3 p-4">
        <a
          href={listing.itemUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 font-medium text-zinc-50 transition-colors hover:text-amber-200"
        >
          {listing.title}
          <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-text-top opacity-50" />
        </a>
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
      </div>
    </Card>
  );
}
