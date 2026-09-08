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

const FAIL_UNCONFIGURED: GatekeeperVerdict = { isGenuine: false, reason: "AI not configured" };
const FAIL_EVALUATION: GatekeeperVerdict = { isGenuine: false, reason: "ai_evaluation_failed" };

export async function verifyListingWithAi(params: GatekeeperParams): Promise<GatekeeperVerdict> {
  const config = await getAiRuntimeConfig();
  if (!config.aiApiKey && !isLocalAiEndpoint(config.aiBaseUrl)) {
    return FAIL_UNCONFIGURED;
  }

  const format = params.buyingFormat || "UNKNOWN";
  const system = `You are an expert personal shopping assistant evaluating eBay listings for a buyer.
The user's intended target item is: "${params.targetQuery}".
Listing to evaluate: "${params.title}" priced at ${params.price} ${params.currency} (${format}) on marketplace "${params.marketplaceId}".

Your goal: Determine if this listing fulfills the buyer's underlying purchase intent.

Evaluation Rules:
1. INTENT & UPGRADES (ACCEPT):
   - Accept genuine products matching the target intent.
   - Accept equivalent or superior models/variants unless the user explicitly specified negative exclusions (e.g., if user searches "PS5" or "PS5 825GB", ACCEPT PS5 Disc, PS5 Digital, PS5 Slim, or 1TB models).
   - Accept bundles (e.g., console + games, phone + original charger, extra controllers).
   - Accept minor cosmetic wear (e.g., "Kratzer", "Gebraucht", "Gebrauchsspuren").
   - German marketplace: "mit OVP" or "- OVP" means the device includes the original box. ACCEPT if it is the full product.

2. DEFECTS & JUNK (REJECT):
   - REJECT broken, malfunctioning, or defective hardware (e.g., "Absturz", "defekt", "für Bastler", "Fehler", "spares", "untested").
   - REJECT accessories, parts, and add-ons (e.g., steering wheels, stands, faceplates, Joy-Cons only, screens, replacement housing).
   - REJECT empty packaging, dummy units, or boxes ("nur OVP", "leere Schachtel", "leere Verpackung", "Karton ohne Gerät").
   - REJECT inferior downgrades or completely different products (e.g., PS4 when target is PS5; Xiaomi 14 Lite/Redmi when target is Xiaomi 14).

Return JSON ONLY:
{
  "isGenuine": boolean,
  "reason": "Clear 3-6 word justification"
}`;

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

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        model: config.aiModel,
        temperature: 0.1,
        max_tokens: 80,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: "Return the JSON verdict now. Default isGenuine to false if uncertain." },
        ],
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`provider ${response.status}: ${raw.slice(0, 180)}`);
    }

    const parsed = parseVerdict(raw);
    if (!parsed) {
      throw new Error("unparseable gatekeeper response");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ai-gatekeeper] Check timed out/failed, defaulting to reject (${message})`);
    return FAIL_EVALUATION;
  }
}

function parseVerdict(raw: string): GatekeeperVerdict | null {
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

  try {
    const body = JSON.parse(jsonText) as { isGenuine?: unknown; reason?: unknown };
    if (typeof body.isGenuine !== "boolean") return null;
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 80)
        : body.isGenuine
          ? "genuine match"
          : "not genuine";
    return { isGenuine: body.isGenuine, reason };
  } catch {
    return null;
  }
}

function extractChoiceContent(payload: object): string | null {
  const choices = (payload as { choices?: Array<{ message?: { content?: string | null } }> }).choices;
  return choices?.[0]?.message?.content?.trim() || null;
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return null;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
