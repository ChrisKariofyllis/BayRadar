import { parseNegativesJson, sanitizeNegativeKeywords } from "@/lib/ai/sanitize-negatives";
import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { suggestNegativesSchema } from "@/lib/schemas/ai-settings";
import { AiClientError, completeChat, parseKeywordList } from "@/services/ai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const parsed = suggestNegativesSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    const { query, marketplaceId, minPrice, maxPrice } = parsed.data;
    const priceHint =
      minPrice != null || maxPrice != null
        ? ` Price window: ${minPrice ?? "any"} to ${maxPrice ?? "any"}.`
        : "";

    const system = `You generate negative keywords for an eBay search filter.
The buyer is searching for exactly: "${query}" on marketplace "${marketplaceId}".

Return JSON ONLY in this shape:
{ "negatives": ["term1", "term2"] }

Rules:
- Output 12-22 short lowercase keywords or 2-word phrases in the marketplace language.
- MUST NEVER return any word that already appears in the user's query. If the query is "Honor Magic 6 Pro", never output honor, magic, 6, or pro.
- NEVER output conversational filler: etc, wait, exclude, devices, variations, brands, or any explanation.
- NEVER output standalone numbers.
- German eBay packaging: exclude "nur ovp", "leerer karton", "schachtel", "leere verpackung". NEVER exclude standalone "ovp" (sellers use it to mean the device includes the original box).
- Target only junk:
  - accessories: hülle, case, panzerglas, folie, ladegerät, kabel
  - replacement parts: display, bildschirm, ersatzteil, akku, rückseite, reparatur, mainboard
  - conflicting budget / sibling lines that are NOT in the query (e.g. lite, 14t, redmi, note) only when they would steal results from this exact model.
- Each term must be 3-24 characters. No quotes, brackets, colons, markdown, or numbering.`;

    const completion = await completeChat({
      system,
      prompt: `Device query: ${query}. Marketplace: ${marketplaceId}.${priceHint} Return JSON {"negatives":[...]} now.`,
      maxTokens: 400,
      temperature: 0.2,
      responseFormat: { type: "json_object" },
    });

    const extracted = parseNegativesJson(completion);
    const fallback = extracted.length > 0 ? extracted : parseKeywordList(completion);
    const keywords = sanitizeNegativeKeywords(fallback, query).slice(0, 25);

    if (keywords.length < 5) {
      return jsonError("AI returned too few usable keywords. Try a more specific search query.", 502);
    }

    return jsonOk({ keywords });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    if (error instanceof AiClientError) {
      return jsonError(error.message, error.status && error.status >= 400 ? error.status : 502);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/ai/suggest-negatives] ${message}`);
    return jsonError("Failed to generate negative keywords", 500);
  }
}
