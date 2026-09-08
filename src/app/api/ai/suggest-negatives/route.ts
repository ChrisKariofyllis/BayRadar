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

    const system = `You are an expert eBay deal sniper assistant. The user wants to buy the physical, genuine standalone device: "${query}" on marketplace "${marketplaceId}". Analyze common search junk for this specific device and output negative keywords to exclude:
    1. Replacement hardware parts & repairs (e.g. in German for EBAY_DE: display, bildschirm, ersatzteil, reparatur, akku, rückseite, mainboard, kamera, defekt).
    2. Sub-brands, budget variations, or conflicting models if user specified a base model (e.g. for "Xiaomi 14", exclude "14t", "redmi", "note", "ultra", "pro", "lite").
    3. Empty boxes, accessories, and promotional items (e.g. ovp, karton, dummy, hülle, panzerglas, schutzfolie).
    Return ONLY a comma-separated list of 15-25 lowercase negative keywords in the marketplace language. No numbering, no introductory text, no markdown.`;

    const completion = await completeChat({
      system,
      prompt: `Device: ${query}. Marketplace: ${marketplaceId}.${priceHint} Return the negative keyword list now.`,
      maxTokens: 400,
      temperature: 0.3,
    });

    const keywords = parseKeywordList(completion).slice(0, 25);
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
