import { AlertTriangle, Ban, Crosshair, LoaderCircle, Trophy } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatEuroAmount, listingSnipeState, type ListingSnipeState } from "@/lib/format-ui";
import type { SeenListing } from "@/lib/types";

const BADGE_BASE =
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium tracking-wide backdrop-blur-md";

const STYLES: Record<NonNullable<ListingSnipeState>["kind"], string> = {
  armed: "border-emerald-400/40 bg-emerald-950/55 text-emerald-100",
  checking: "border-zinc-400/35 bg-zinc-900/70 text-zinc-200",
  won: "border-emerald-400/50 bg-emerald-950/60 text-emerald-100",
  outbid: "border-rose-400/40 bg-rose-950/50 text-rose-100",
  failed: "border-amber-400/45 bg-amber-950/50 text-amber-100",
};

export function listingSnipeCardClass(listing: SeenListing): string | undefined {
  const state = listingSnipeState(listing);
  if (!state) return undefined;
  if (state.kind === "won") return "border-emerald-400/50 ring-1 ring-emerald-400/25";
  if (state.kind === "outbid") return "border-rose-400/35 ring-1 ring-rose-950/40";
  if (state.kind === "failed") return "border-amber-400/40 ring-1 ring-amber-500/20";
  if (state.kind === "checking") return "border-zinc-500/35 ring-1 ring-white/5";
  return "border-amber-400/45 ring-1 ring-emerald-400/30";
}

export function SnipeStatusBadge({ listing, className }: { listing: SeenListing; className?: string }) {
  const state = listingSnipeState(listing);
  if (!state) return null;

  const amount = state.kind === "won" ? (state.finalPrice ?? state.maxBid) : state.maxBid;
  const label =
    state.kind === "armed"
      ? `Sniped: €${formatEuroAmount(state.maxBid)}`
      : state.kind === "checking"
        ? "Checking Outcome..."
        : state.kind === "won"
          ? `Won: €${formatEuroAmount(amount)}`
          : state.kind === "outbid"
            ? "Outbid"
            : "Snipe Failed";

  const Icon =
    state.kind === "won"
      ? Trophy
      : state.kind === "outbid"
        ? Ban
        : state.kind === "failed"
          ? AlertTriangle
          : state.kind === "checking"
            ? LoaderCircle
            : Crosshair;

  return (
    <span title={label} className={cn(BADGE_BASE, STYLES[state.kind], className)}>
      <Icon className={cn("size-3 shrink-0", state.kind === "checking" && "animate-spin")} />
      <span className="select-none tabular-nums">{label}</span>
    </span>
  );
}

export function SnipeOutcomeBanner({ listing }: { listing: SeenListing }) {
  const state = listingSnipeState(listing);
  if (!state || state.kind === "armed") return null;

  const amount = state.kind === "won" ? (state.finalPrice ?? state.maxBid) : state.maxBid;
  const copy =
    state.kind === "checking"
      ? "Auction ended. Checking Gixen for the outcome…"
      : state.kind === "won"
        ? `Won at €${formatEuroAmount(amount)}`
        : state.kind === "outbid"
          ? `Outbid — max was €${formatEuroAmount(state.maxBid)}`
          : "Gixen failed to place this snipe.";

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-sm",
        state.kind === "won" && "border-emerald-400/30 bg-emerald-950/30 text-emerald-100",
        state.kind === "outbid" && "border-rose-400/30 bg-rose-950/30 text-rose-100",
        state.kind === "failed" && "border-amber-400/30 bg-amber-950/30 text-amber-100",
        state.kind === "checking" && "border-white/10 bg-white/[0.04] text-zinc-200",
      )}
    >
      {copy}
    </div>
  );
}
