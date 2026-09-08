export type ScanStage = "idle" | "fetching" | "analyzing" | "complete" | "error";

export interface ScanProgress {
  status: ScanStage;
  label: string;
  current: number;
  total: number;
  percent: number;
  newDealsFound: number;
  aiEnabled: boolean;
  monitorName: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
}

type Listener = (progress: ScanProgress) => void;

const listeners = new Set<Listener>();

let state: ScanProgress = idleProgress();

export function getScanProgress(): ScanProgress {
  return state;
}

export function subscribeScanProgress(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function beginScanProgress(options?: { aiEnabled?: boolean }) {
  publish({
    status: "fetching",
    label: "Fetching eBay listings…",
    current: 0,
    total: 0,
    percent: 0,
    newDealsFound: 0,
    aiEnabled: Boolean(options?.aiEnabled),
    monitorName: null,
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
  });
}

export function markScanFetching(monitorName?: string) {
  publish({
    status: "fetching",
    monitorName: monitorName ?? state.monitorName,
    label: monitorName ? `Fetching eBay listings… (${monitorName})` : "Fetching eBay listings…",
  });
}

export function addScanListings(count: number) {
  if (count <= 0) return;
  const total = state.total + count;
  publish({
    total,
    percent: percent(state.current, total),
    label: inspectLabel(state.current, total, state.aiEnabled),
  });
}

export function incrementScanInspected(options?: { ai?: boolean; newDeal?: boolean }) {
  const current = state.current + 1;
  const aiEnabled = state.aiEnabled || Boolean(options?.ai);
  const newDealsFound = state.newDealsFound + (options?.newDeal ? 1 : 0);
  const status: ScanStage = aiEnabled ? "analyzing" : state.status === "fetching" ? "analyzing" : state.status;
  publish({
    status,
    current,
    aiEnabled,
    newDealsFound,
    percent: percent(current, state.total),
    label: inspectLabel(current, state.total, aiEnabled),
  });
}

export function finishScanProgress(options?: { newDealsFound?: number }) {
  const newDealsFound = options?.newDealsFound ?? state.newDealsFound;
  publish({
    status: "complete",
    label: "Complete",
    current: Math.max(state.current, state.total),
    percent: 100,
    newDealsFound,
    finishedAt: Date.now(),
    error: null,
  });
}

export function failScanProgress(message: string) {
  publish({
    status: "error",
    label: "Scan failed",
    error: message,
    finishedAt: Date.now(),
  });
}

function inspectLabel(current: number, total: number, aiEnabled: boolean): string {
  const safeTotal = Math.max(total, current, 0);
  const pct = percent(current, safeTotal);
  if (aiEnabled) {
    return `Evaluating deals with AI Gatekeeper: ${current} / ${safeTotal} (${pct}%)`;
  }
  return `Inspecting listings: ${current} / ${safeTotal} (${pct}%)`;
}

function percent(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

function publish(patch: Partial<ScanProgress>) {
  state = { ...state, ...patch, percent: patch.percent ?? percent(patch.current ?? state.current, patch.total ?? state.total) };
  for (const listener of listeners) {
    listener(state);
  }
}

function idleProgress(): ScanProgress {
  return {
    status: "idle",
    label: "Idle",
    current: 0,
    total: 0,
    percent: 0,
    newDealsFound: 0,
    aiEnabled: false,
    monitorName: null,
    startedAt: null,
    finishedAt: null,
    error: null,
  };
}
