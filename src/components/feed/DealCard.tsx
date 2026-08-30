"use client";

import { Clock3, ExternalLink, Gavel, ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
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
      <div className="relative aspect-[4/3] bg-zinc-800">
        {listing.imageUrl ? (
          // eBay CDN URLs vary; native img avoids remotePatterns config.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <Badge tone={auction ? "warning" : "success"}>{listingFormatLabel(listing.buyingFormat)}</Badge>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <a
          href={listing.itemUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 font-medium text-zinc-50 hover:text-amber-300"
        >
          {listing.title}
          <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-text-top opacity-60" />
        </a>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{formatEuro(listing.price, listing.currency)}</Badge>
          {auction && listing.bidCount != null ? (
            <Badge>
              <Gavel className="mr-1 h-3 w-3" />
              {listing.bidCount} bids
            </Badge>
          ) : null}
          {auction && countdown ? (
            <Badge tone={countdown === "Ended" ? "danger" : "warning"}>
              <Clock3 className="mr-1 h-3 w-3" />
              {countdown}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <Badge>{listing.monitor.name}</Badge>
          <span>{formatDateTime(listing.createdAt)}</span>
        </div>
      </div>
    </Card>
  );
}
