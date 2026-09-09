export type ScanStage = "idle" | "fetching" | "analyzing" | "complete" | "error";

export interface ScanProgress {
  status: ScanStage;
  label: string;
  current: number;
  total: number;
  percent: number;
  newDealsFound: number;
  fetchedFromEbay: number;
  passedAi: number;
  aiRejected: number;
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
    fetchedFromEbay: 0,
    passedAi: 0,
    aiRejected: 0,
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
  const fetchedFromEbay = state.fetchedFromEbay + Math.max(0, count);
  const total = state.total + Math.max(0, count);
  publish({
    fetchedFromEbay,
    total,
    percent: percent(state.current, total),
    label: inspectLabel(state.current, total, state.aiEnabled, fetchedFromEbay, state.passedAi),
  });
}

export function incrementScanInspected(options?: { ai?: boolean; newDeal?: boolean }) {
  incrementScanInspectedBy(1, options);
}

export function incrementScanInspectedBy(count: number, options?: { ai?: boolean; newDeal?: boolean }) {
  if (count <= 0) return;
  const current = state.current + count;
  const aiEnabled = state.aiEnabled || Boolean(options?.ai);
  const newDealsFound = state.newDealsFound + (options?.newDeal ? 1 : 0);
  const status: ScanStage = aiEnabled ? "analyzing" : state.status === "fetching" ? "analyzing" : state.status;
  publish({
    status,
    current,
    aiEnabled,
    newDealsFound,
    percent: percent(current, state.total),
    label: inspectLabel(current, state.total, aiEnabled, state.fetchedFromEbay, state.passedAi),
  });
}

export function markScanAiBatch(chunkIndex: number, chunkCount: number) {
  const total = Math.max(state.total, state.current, 0);
  const pct = percent(state.current, total);
  publish({
    status: "analyzing",
    aiEnabled: true,
    label: `Evaluating deals with AI Gatekeeper: batch ${chunkIndex} / ${chunkCount} (${pct}%) · ${state.fetchedFromEbay} from eBay · ${state.passedAi} passed AI`,
  });
}

export function recordAiVerdict(passed: boolean) {
  const passedAi = state.passedAi + (passed ? 1 : 0);
  const aiRejected = state.aiRejected + (passed ? 0 : 1);
  publish({
    passedAi,
    aiRejected,
    aiEnabled: true,
    status: "analyzing",
    label: inspectLabel(state.current, state.total, true, state.fetchedFromEbay, passedAi),
  });
}

export function finishScanProgress(options?: { newDealsFound?: number }) {
  const newDealsFound = options?.newDealsFound ?? state.newDealsFound;
  const summary = state.aiEnabled
    ? `Complete · ${state.fetchedFromEbay} from eBay · ${state.passedAi} passed AI`
    : `Complete · ${state.fetchedFromEbay} from eBay`;
  publish({
    status: "complete",
    label: summary,
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

function inspectLabel(
  current: number,
  total: number,
  aiEnabled: boolean,
  fetchedFromEbay: number,
  passedAi: number,
): string {
  const safeTotal = Math.max(total, current, 0);
  const pct = percent(current, safeTotal);
  if (aiEnabled) {
    return `Evaluating deals with AI Gatekeeper: ${current} / ${safeTotal} (${pct}%) · ${fetchedFromEbay} from eBay · ${passedAi} passed AI`;
  }
  return `Inspecting listings: ${current} / ${safeTotal} (${pct}%) · ${fetchedFromEbay} from eBay`;
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
    fetchedFromEbay: 0,
    passedAi: 0,
    aiRejected: 0,
    aiEnabled: false,
    monitorName: null,
    startedAt: null,
    finishedAt: null,
    error: null,
  };
}
