"use client";

import { Plus, Radar, Settings, SlidersHorizontal, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ScanButton } from "@/components/layout/ScanButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { requestNewMonitor } from "@/lib/ui-events";

const links = [
  { href: "/", label: "Monitors", icon: SlidersHorizontal },
  { href: "/feed", label: "Deals Feed", icon: Zap },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleNewMonitor() {
    if (pathname === "/" || pathname.startsWith("/monitors")) {
      requestNewMonitor();
      return;
    }
    router.push("/?new=1");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-3">
        <Brand />

        <nav
          aria-label="Primary"
          className="hidden items-center rounded-full border border-white/[0.08] bg-white/[0.04] p-1 sm:flex"
        >
          {links.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" || pathname.startsWith("/monitors") : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-white/[0.1] text-zinc-50 shadow-sm ring-1 ring-white/10"
                    : "text-zinc-400 hover:text-zinc-100",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ScanButton compact />
          <Button onClick={handleNewMonitor} size="sm">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Monitor</span>
          </Button>
        </div>
      </div>

      <nav aria-label="Primary" className="flex gap-1 overflow-x-auto border-t border-white/[0.05] px-4 py-2 sm:hidden">
        {links.map((link) => {
          const active =
            link.href === "/" ? pathname === "/" || pathname.startsWith("/monitors") : pathname.startsWith(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm",
                active ? "bg-white/[0.08] text-zinc-50" : "text-zinc-400",
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-zinc-50">
      <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-950 shadow-sm ring-1 ring-white/10">
        <span className="radar-ring absolute inset-0 rounded-xl bg-amber-300/40" />
        <Radar className="radar-pulse relative h-4 w-4" />
      </span>
      <span className="flex items-center gap-2">
        BayRadar
        <span className="relative flex h-2 w-2" aria-label="Live">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
      </span>
    </Link>
  );
}
