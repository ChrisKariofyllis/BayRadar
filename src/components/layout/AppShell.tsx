import type { ReactNode } from "react";

import { Navbar } from "@/components/layout/Navbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100 lg:flex">
      <Navbar />
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
