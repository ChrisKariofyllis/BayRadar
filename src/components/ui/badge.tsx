import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-white/5 text-zinc-300 border-white/10",
  success: "bg-emerald-500/10 text-emerald-300 border-emerald-400/15",
  warning: "bg-amber-400/10 text-amber-200 border-amber-300/15",
  danger: "bg-red-500/10 text-red-300 border-red-400/15",
  info: "bg-sky-500/10 text-sky-300 border-sky-400/15",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
