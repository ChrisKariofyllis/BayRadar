import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";

import { Label } from "@/components/ui/input";
import { cn } from "@/lib/cn";

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="px-4 text-[13px] font-normal text-zinc-400">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsGroup({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="divide-y divide-white/[0.08] overflow-hidden rounded-[12px] bg-zinc-900 ring-1 ring-white/[0.08]">
        {children}
      </div>
      {footer ? <div className="px-4 text-[12px] leading-4 text-zinc-400">{footer}</div> : null}
    </div>
  );
}

export function SettingsRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-11 items-center justify-between gap-3 px-4 py-2.5", className)}>
      {children}
    </div>
  );
}

export function SettingsStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 px-4 py-3", className)}>{children}</div>;
}

export function SettingsField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-normal text-zinc-400">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function SettingsSecretToggle({
  revealed,
  onToggle,
  hideLabel,
  showLabel,
}: {
  revealed: boolean;
  onToggle: () => void;
  hideLabel: string;
  showLabel: string;
}) {
  return (
    <button
      type="button"
      className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100"
      onClick={onToggle}
      aria-label={revealed ? hideLabel : showLabel}
    >
      {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}
