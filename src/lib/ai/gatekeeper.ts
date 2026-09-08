import { getAiRuntimeConfig, isLocalAiEndpoint } from "@/services/config";

export interface GatekeeperParams {
  targetQuery: string;
  title: string;
  price: number;
  currency: string;
  marketplaceId: string;
}

export interface GatekeeperVerdict {
  isGenuine: boolean;
  reason: string;
}

const PASS_UNCONFIGURED: GatekeeperVerdict = { isGenuine: true, reason: "AI not configured" };
const PASS_TIMEOUT: GatekeeperVerdict = { isGenuine: true, reason: "timeout_fallback" };

export async function verifyListingWithAi(params: GatekeeperParams): Promise<GatekeeperVerdict> {
  const config = await getAiRuntimeConfig();
  if (!config.aiApiKey && !isLocalAiEndpoint(config.aiBaseUrl)) {
    return PASS_UNCONFIGURED;
  }

  const system = `You are a strict deal-evaluation gatekeeper for an automated shopping bot.
The buyer wants specifically: "${params.targetQuery}".
Analyze the listing title: "${params.title}" priced at ${params.price} ${params.currency} on marketplace "${params.marketplaceId}".

Determine if this listing is the genuine, complete, functional product itself.
Return false if the listing is:
- A replacement part (e.g., display, screen, motherboard, battery, camera module, glass, frame).
- A repair or unlocking service.
- An accessory (case, bag, charger, cable, stand).
- An empty box, packaging only ("OVP", "nur Karton"), or a display dummy.
- A distinctly different sub-model or downgrade (e.g., target is "Xiaomi 14", but listing is "14T", "Redmi Note 14", "14 Lite").

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
          { role: "user", content: "Return the JSON verdict now." },
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
    console.warn(`[ai-gatekeeper] Check timed out/failed, defaulting to pass (${message})`);
    return PASS_TIMEOUT;
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
