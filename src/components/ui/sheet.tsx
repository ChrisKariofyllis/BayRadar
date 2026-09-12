"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";

const CLOSE_DISTANCE = 96;
const MD_QUERY = "(min-width: 768px)";

export function Sheet({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const dragging = useRef(false);
  const [present, setPresent] = useState(open);
  const [entered, setEntered] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    const media = window.matchMedia(MD_QUERY);
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setDragY(0);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setEntered(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }

    setEntered(false);
    setDragY((current) => (current > 0 ? Math.max(current, window.innerHeight) : 0));
    const timeout = window.setTimeout(() => {
      setPresent(false);
      setDragY(0);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!present) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [present, onClose]);

  function canSwipe() {
    return !desktop;
  }

  function onHandlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canSwipe() || event.button !== 0) return;
    dragging.current = true;
    startY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onHandlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    setDragY(Math.max(0, event.clientY - startY.current));
  }

  function onHandlePointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragY >= CLOSE_DISTANCE) {
      onClose();
      return;
    }
    setDragY(0);
  }

  if (!present) return null;

  const draggingNow = dragging.current && dragY > 0;
  const mobileOffset = !desktop && (dragY > 0 || !entered) ? dragY : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center md:p-4">
      <button
        type="button"
        aria-label="Close listing details"
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          entered ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-white/[0.08] bg-[#18181b] shadow-2xl ring-1 ring-white/10",
          "md:relative md:inset-auto md:max-h-[90vh] md:w-full md:max-w-xl md:rounded-2xl",
          draggingNow ? "" : "transition-all duration-300 ease-out",
          entered
            ? "translate-y-0 md:scale-100 md:opacity-100"
            : "translate-y-full md:translate-y-0 md:scale-95 md:opacity-0",
        )}
        style={mobileOffset ? { transform: `translateY(${mobileOffset}px)` } : undefined}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1 md:hidden"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <span className="h-1.5 w-12 rounded-full bg-zinc-500/80" aria-hidden />
        </div>
        {children}
      </div>
    </div>
  );
}
