import { MAX_VALUATIONS_PER_CYCLE, VALUATION_TIMEOUT_MS } from "@/lib/valuation/defaults";
import { AiClientError, completeChatRaw, completeGeminiGenerateContent, isGeminiGoogleEndpoint } from "@/services/ai/client";
import { getAiRuntimeConfig, isLocalAiEndpoint } from "@/services/config";

export { MAX_VALUATIONS_PER_CYCLE, VALUATION_TIMEOUT_MS } from "@/lib/valuation/defaults";

const HEURISTIC_SYSTEM_PROMPT = `You estimate used-device resale value in Germany from the listing title and condition only.
Do not browse the web, do not use tools, and do not claim live market quotes.
Return ONLY valid JSON: {"fmv": number} in EUR for a fully functional unit.`;

export interface ValuationListing {
  title: string;
  price: number;
  shipping: number;
  condition?: string;
  targetMarketValue?: number | null;
}

export interface ValuationResult {
  estimatedFmv: number;
  discountPercent: number;
  estimatedProfit: number;
  source: "target" | "heuristic";
}

export interface ListingEnrichment {
  valuation: ValuationResult | null;
}

export async function enrichListingValuation(listing: ValuationListing): Promise<ListingEnrichment> {
  return { valuation: await estimateArbitrage(listing) };
}

export interface ValuationBudget {
  remaining: number;
}

export function createValuationBudget(enabled: boolean): ValuationBudget {
  return { remaining: enabled ? MAX_VALUATIONS_PER_CYCLE : 0 };
}

export function resolveTargetMarketValue(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Number(value);
}

export function valuationFromFmv(fmv: number, totalCost: number, source: ValuationResult["source"]): ValuationResult {
  const discountPercent = Math.round(((fmv - totalCost) / fmv) * 100);
  const estimatedProfit = Number((fmv - totalCost).toFixed(2));
  return {
    estimatedFmv: Number(fmv.toFixed(2)),
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    estimatedProfit: Number.isFinite(estimatedProfit) ? estimatedProfit : 0,
    source,
  };
}

export async function estimateArbitrage(listing: ValuationListing): Promise<ValuationResult | null> {
  const price = Number(listing.price);
  const shipping = Number.isFinite(listing.shipping) ? Math.max(0, listing.shipping) : 0;
  if (!Number.isFinite(price) || price <= 0) return null;

  const totalCost = price + shipping;
  const target = resolveTargetMarketValue(listing.targetMarketValue);
  if (target != null) {
    return valuationFromFmv(target, totalCost, "target");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALUATION_TIMEOUT_MS);

  try {
    return await estimateArbitrageOnce(listing, totalCost, controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function estimateArbitrageOnce(
  listing: ValuationListing,
  totalCost: number,
  signal: AbortSignal,
): Promise<ValuationResult | null> {
  if (signal.aborted) return null;

  const config = await getAiRuntimeConfig();
  if (!config.aiApiKey && !isLocalAiEndpoint(config.aiBaseUrl)) return null;

  const title = listing.title.trim();
  if (!title) return null;

  const prompt = [
    `Title: ${title}`,
    `Condition: ${listing.condition?.trim() || "used"}`,
    `Ask price: ${totalCost.toFixed(2)} EUR (item ${Number(listing.price).toFixed(2)} + shipping ${Number(listing.shipping).toFixed(2)})`,
    "Estimate a typical German used/refurbished resale value from the title alone.",
    "Return JSON only.",
  ].join("\n");

  const models = [config.aiModel];
  const fallback = config.aiFallbackModel?.trim();
  if (config.enableFallback && fallback && fallback !== config.aiModel) {
    models.push(fallback);
  }

  for (const model of models) {
    if (signal.aborted) return null;
    try {
      const fmv = await requestHeuristicFmv(prompt, model, signal);
      if (fmv != null) return valuationFromFmv(fmv, totalCost, "heuristic");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[valuation] Heuristic FMV failed model=${model}: ${message}`);
      if (!(error instanceof AiClientError)) continue;
    }
  }

  return null;
}

async function requestHeuristicFmv(prompt: string, model: string, signal: AbortSignal): Promise<number | null> {
  const config = await getAiRuntimeConfig();

  if ((isGeminiGoogleEndpoint(config.aiBaseUrl) || /gemini/i.test(model)) && config.aiApiKey) {
    const result = await completeGeminiGenerateContent({
      model,
      prompt,
      system: HEURISTIC_SYSTEM_PROMPT,
      apiKey: config.aiApiKey,
      baseUrl: config.aiBaseUrl,
      signal,
      timeoutMs: VALUATION_TIMEOUT_MS,
      maxTokens: 160,
    });
    return parseFmv(result.content);
  }

  const result = await completeChatRaw({
    model,
    signal,
    timeoutMs: VALUATION_TIMEOUT_MS,
    temperature: 0,
    maxTokens: 160,
    system: HEURISTIC_SYSTEM_PROMPT,
    prompt,
  });
  return parseFmv(result.content);
}

function parseFmv(content: string): number | null {
  const jsonText = extractJsonObject(content);
  if (!jsonText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const raw = (parsed as { fmv?: unknown }).fmv;
  const fmv = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isFinite(fmv) && fmv > 0 ? fmv : null;
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  if (text.startsWith("{") && text.endsWith("}")) return text;
  const match = text.match(/\{[\s\S]*\}/);
  return match?.[0] ?? null;
}
