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
  const lookingForBroken = /\b(defekt|bastler|broken|parts? only|ersatzteilspender)\b/i.test(params.targetQuery);
  const system = `You are a zero-tolerance deal-evaluation gatekeeper for an automated shopping bot.
The buyer wants ONLY the core main system or device itself: "${params.targetQuery}".
Analyze the listing title: "${params.title}" priced at ${params.price} ${params.currency} (${format}) on marketplace "${params.marketplaceId}".

isGenuine must be true ONLY if the listing is the genuine, complete, functional target product itself — not something that merely mentions the target.

German marketplace nuance (EBAY_DE):
- "mit OVP" or "- OVP" means the device includes the original box. ACCEPT if it is the full phone/console.
- "nur OVP", "leere Verpackung", "leerer Karton", "Karton ohne Gerät" means empty packaging. REJECT.
- Cosmetic wear is still a genuine device: "Riss auf der Rückseite", "Kratzer", "Gebraucht", "gebraucht", "akzeptabler Zustand". ACCEPT.
- Non-working units: "Defekt", "für Bastler", "Ersatzteilspender", "geht nicht". REJECT unless the buyer explicitly searched for broken items (buyer search broken=${lookingForBroken}).

REJECT instantly (isGenuine=false) if the listing is:
- An accessory or third-party add-on, even when the title says "für ${params.targetQuery}" / "for ${params.targetQuery}".
- Console accessories: steering wheel (Lenkrad, wheel), Joy-Con set, controller, grip, dock, stand, charger, cable, carrying case, skin, bracket, screen protector.
- Phone accessories or parts: display, bildschirm, motherboard, mainboard, battery, kamera, glass, frame, charger, cable, hülle, case, empty box.
- A repair, unlocking, or service listing.
- A dummy, replica, or empty packaging only.
- A different sub-model or downgrade (e.g. target "Xiaomi 14" but listing is 14T, 14 Ultra, Redmi, Note, Lite if the buyer specified the base model only).

Price feasibility: if this is Buy It Now / FIXED_PRICE and the price is under 35% of typical market value for a complete console or phone matching the target, treat it as an accessory or part and REJECT.

Default to false when unsure. Never approve an accessory because the brand or model name appears in the title.

Return JSON ONLY:
{
  "isGenuine": boolean,
  "reason": "Short 3-6 word explanation"
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
      signal: AbortSignal.timeout(4000),
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
