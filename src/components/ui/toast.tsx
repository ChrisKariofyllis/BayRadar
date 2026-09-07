"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  push: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-20 z-[60] flex w-[min(100%-2rem,24rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-2xl border px-3 py-3 shadow-lg backdrop-blur-xl",
              toast.tone === "success" && "border-emerald-500/20 bg-[#18181b]/90 text-emerald-200",
              toast.tone === "error" && "border-red-500/20 bg-[#18181b]/90 text-red-200",
              toast.tone === "info" && "border-sky-500/20 bg-[#18181b]/90 text-sky-200",
            )}
          >
            {toast.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}
            {toast.tone === "error" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : null}
            {toast.tone === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.description ? <p className="mt-0.5 text-xs text-zinc-400">{toast.description}</p> : null}
            </div>
            <button
              type="button"
              className="text-zinc-500 hover:text-zinc-200"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
