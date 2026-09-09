import { getAiRuntimeConfig, isLocalAiEndpoint } from "@/services/config";

export interface GatekeeperParams {
  targetQuery: string;
  title: string;
  price: number;
  currency: string;
  marketplaceId: string;
  buyingFormat?: string;
}

export interface GatekeeperVerdict {
  isGenuine: boolean;
  reason: string;
}

export interface BatchItemCandidate {
  id: string;
  title: string;
  price: number;
  currency: string;
}

export interface VerificationResult {
  isGenuine: boolean;
  reason: string;
  errorType?: "RATE_LIMIT";
}

export type BatchChunkProgressHandler = (chunkIndex: number, chunkCount: number) => void;

const BATCH_SIZE = 18;
const CHUNK_DELAY_MS = 1200;
const RETRY_429_DELAY_MS = 3000;
const BATCH_TIMEOUT_MS = 30_000;

const FAIL_UNCONFIGURED: VerificationResult = { isGenuine: false, reason: "AI not configured" };
const FAIL_EVALUATION: VerificationResult = { isGenuine: false, reason: "ai_evaluation_failed" };
const FAIL_BATCH: VerificationResult = { isGenuine: false, reason: "ai_batch_error" };
const FAIL_QUOTA: VerificationResult = {
  isGenuine: false,
  reason: "QUOTA_EXHAUSTED",
  errorType: "RATE_LIMIT",
};

export async function verifyListingWithAi(params: GatekeeperParams): Promise<GatekeeperVerdict> {
  const results = await verifyListingsBatch(params.targetQuery, params.marketplaceId, [
    {
      id: "single",
      title: params.title,
      price: params.price,
      currency: params.currency,
    },
  ]);
  return results.get("single") ?? FAIL_EVALUATION;
}

export async function verifyListingsBatch(
  targetQuery: string,
  marketplaceId: string,
  items: BatchItemCandidate[],
  onChunk?: BatchChunkProgressHandler,
): Promise<Map<string, VerificationResult>> {
  const results = new Map<string, VerificationResult>();
  if (items.length === 0) return results;

  const config = await getAiRuntimeConfig();
  if (!config.aiApiKey && !isLocalAiEndpoint(config.aiBaseUrl)) {
    for (const item of items) {
      results.set(item.id, FAIL_UNCONFIGURED);
    }
    return results;
  }

  const chunks = chunkArray(items, BATCH_SIZE);
  console.log(`[ai-gatekeeper] Evaluating ${items.length} candidate(s) in ${chunks.length} batch(es)`);
  for (let index = 0; index < chunks.length; index++) {
    if (index > 0) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
    onChunk?.(index + 1, chunks.length);
    const chunkResults = await verifyChunk(targetQuery, marketplaceId, chunks[index], config);
    for (const [id, result] of chunkResults) {
      results.set(id, result);
    }
  }

  return results;
}

async function verifyChunk(
  targetQuery: string,
  marketplaceId: string,
  chunk: BatchItemCandidate[],
  config: Awaited<ReturnType<typeof getAiRuntimeConfig>>,
): Promise<Map<string, VerificationResult>> {
  try {
    const raw = await requestChunk(targetQuery, marketplaceId, chunk, config);
    const parsed = parseBatchResults(raw, chunk);
    if (!parsed) {
      throw new Error("unparseable gatekeeper batch response");
    }
    return parsed;
  } catch (error) {
    if (isQuotaError(error)) {
      console.warn(`[ai-gatekeeper] Quota exhausted after fallback for ${chunk.length} item(s)`);
      return failChunk(chunk, FAIL_QUOTA);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ai-gatekeeper] Batch chunk failed, rejecting ${chunk.length} item(s) (${message})`, error);
    return failChunk(chunk);
  }
}

async function requestChunk(
  targetQuery: string,
  marketplaceId: string,
  chunk: BatchItemCandidate[],
  config: Awaited<ReturnType<typeof getAiRuntimeConfig>>,
): Promise<string> {
  try {
    return await requestChunkOnce(targetQuery, marketplaceId, chunk, config, config.aiModel);
  } catch (error) {
    if (!isQuotaError(error)) throw error;

    const fallback = config.aiFallbackModel?.trim();
    if (config.enableFallback && fallback && fallback !== config.aiModel) {
      console.warn(
        `[ai-gatekeeper] ⚠️ Quota hit on ${config.aiModel}. Switching to fallback model: ${fallback}`,
      );
      try {
        return await requestChunkOnce(targetQuery, marketplaceId, chunk, config, fallback);
      } catch (fallbackError) {
        if (isQuotaError(fallbackError)) throw new QuotaExhaustedError();
        throw fallbackError;
      }
    }

    console.warn("[ai-gatekeeper] HTTP 429 TooManyRequests, waiting 3s and retrying chunk once");
    await new Promise((r) => setTimeout(r, RETRY_429_DELAY_MS));
    try {
      return await requestChunkOnce(targetQuery, marketplaceId, chunk, config, config.aiModel);
    } catch (retryError) {
      if (isQuotaError(retryError)) throw new QuotaExhaustedError();
      throw retryError;
    }
  }
}

async function requestChunkOnce(
  targetQuery: string,
  marketplaceId: string,
  chunk: BatchItemCandidate[],
  config: Awaited<ReturnType<typeof getAiRuntimeConfig>>,
  model: string,
): Promise<string> {
  const endpoint = `${trimTrailingSlash(config.aiBaseUrl)}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.aiApiKey) {
    headers.Authorization = `Bearer ${config.aiApiKey}`;
  }
  if (config.aiBaseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://github.com/ChrisKariofyllis/BayRadar";
    headers["X-Title"] = "BayRadar";
  }

  const system = `You are an expert deal gatekeeper evaluating candidate listings for a buyer.
Target Item: "${targetQuery}" on marketplace "${marketplaceId}".

Evaluate each candidate item strictly:

ACCEPT: Core genuine device, upgrades, bundles, cosmetic wear.

REJECT: Accessories, spare parts, repair services, dummy/empty boxes, defect/broken/crash units ("Absturz", "defekt"), or conflicting sub-models.

Return JSON ONLY formatted as:
{
"results": [
{ "id": "string", "isGenuine": boolean, "reason": "Short 3-5 word rationale" }
]
}`;

  const user = JSON.stringify(
    chunk.map((item) => ({
      id: item.id,
      title: item.title,
      price: `${item.price} ${item.currency}`,
    })),
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: Math.min(2000, 120 + chunk.length * 70),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const raw = await response.text();
  if (response.status === 429 || (!response.ok && isQuotaMessage(raw))) {
    throw new ProviderHttpError(response.status, raw.slice(0, 180));
  }
  if (!response.ok) {
    throw new Error(`provider ${response.status}: ${raw.slice(0, 180)}`);
  }
  return raw;
}

function parseBatchResults(raw: string, chunk: BatchItemCandidate[]): Map<string, VerificationResult> | null {
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    payload = null;
  }

  const content =
    payload && typeof payload === "object" && payload !== null && "choices" in payload
      ? extractChoiceContent(payload)
      : raw;

  if (!content) return null;

  const jsonText = extractJsonObject(content);
  if (!jsonText) return null;

  let body: unknown;
  try {
    body = JSON.parse(jsonText) as unknown;
  } catch {
    return null;
  }

  const rows = extractResultRows(body);
  if (!rows) return null;

  const byId = new Map<string, VerificationResult>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id || typeof row.isGenuine !== "boolean") continue;
    const reason =
      typeof row.reason === "string" && row.reason.trim()
        ? row.reason.trim().slice(0, 80)
        : row.isGenuine
          ? "genuine match"
          : "not genuine";
    byId.set(id, { isGenuine: row.isGenuine, reason });
  }

  const results = new Map<string, VerificationResult>();
  for (const item of chunk) {
    results.set(item.id, byId.get(item.id) ?? FAIL_BATCH);
  }
  return results;
}

function extractResultRows(body: unknown): Array<{ id?: unknown; isGenuine?: unknown; reason?: unknown }> | null {
  if (Array.isArray(body)) {
    return body as Array<{ id?: unknown; isGenuine?: unknown; reason?: unknown }>;
  }
  if (body && typeof body === "object" && "results" in body) {
    const results = (body as { results?: unknown }).results;
    if (Array.isArray(results)) {
      return results as Array<{ id?: unknown; isGenuine?: unknown; reason?: unknown }>;
    }
  }
  return null;
}

function failChunk(
  chunk: BatchItemCandidate[],
  verdict: VerificationResult = FAIL_BATCH,
): Map<string, VerificationResult> {
  const results = new Map<string, VerificationResult>();
  for (const item of chunk) {
    results.set(item.id, verdict);
  }
  return results;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function extractChoiceContent(payload: object): string | null {
  const choices = (payload as { choices?: Array<{ message?: { content?: string | null } }> }).choices;
  return choices?.[0]?.message?.content?.trim() || null;
}

function extractJsonObject(text: string): string | null {
  const candidate = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return null;
}

function isQuotaMessage(text: string): boolean {
  return /resource.?exhausted|quota.?exceeded|too many requests|rate.?limit/i.test(text);
}

function isQuotaError(error: unknown): boolean {
  if (error instanceof QuotaExhaustedError) return true;
  if (error instanceof ProviderHttpError && (error.status === 429 || isQuotaMessage(error.message))) return true;
  const message = error instanceof Error ? error.message : String(error);
  return isQuotaMessage(message) || /\b429\b/.test(message);
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    details: string,
  ) {
    super(`provider ${status}: ${details}`);
    this.name = "ProviderHttpError";
  }
}

class QuotaExhaustedError extends Error {
  constructor() {
    super("QUOTA_EXHAUSTED");
    this.name = "QuotaExhaustedError";
  }
}
