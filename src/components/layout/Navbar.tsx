"use client";

import { Menu, Radar, Settings, SlidersHorizontal, X, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ScanButton } from "@/components/layout/ScanButton";
import { cn } from "@/lib/cn";

const links = [
  { href: "/", label: "Monitors", icon: SlidersHorizontal },
  { href: "/feed", label: "Deals Feed", icon: Zap },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <ScanButton compact />
          <button
            type="button"
            className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800"
            onClick={() => setOpen((value) => !value)}
            aria-label="Open menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
          <nav
            className="absolute left-0 top-14 flex h-[calc(100vh-3.5rem)] w-72 flex-col border-r border-zinc-800 bg-zinc-950 p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
          </nav>
        </div>
      ) : null}

      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 lg:flex">
        <div className="flex h-16 items-center border-b border-zinc-800 px-5">
          <Brand />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="border-t border-zinc-800 p-3">
          <ScanButton />
        </div>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-50">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-zinc-950">
        <Radar className="h-4 w-4" />
      </span>
      BayRadar
    </Link>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" || pathname.startsWith("/monitors") : pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-zinc-800 text-amber-300" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
            )}
          >
            <Icon className="h-4 w-4" />
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
