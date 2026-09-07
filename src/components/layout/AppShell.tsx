import type { ReactNode } from "react";

import { Navbar } from "@/components/layout/Navbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-10 min-h-full text-foreground">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
