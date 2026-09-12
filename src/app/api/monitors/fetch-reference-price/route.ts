import { z } from "zod";

import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { fetchIdealoReferencePrice, IdealoLookupError } from "@/lib/valuation/idealoOnDemand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  query: z.string().trim().min(1, "query is required").max(160),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    const result = await fetchIdealoReferencePrice(parsed.data.query);
    return jsonOk({
      success: true,
      price: result.referencePrice,
      title: result.title,
      shop: result.shop,
      url: result.url,
    });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    if (error instanceof IdealoLookupError) {
      return jsonError(error.message, 404);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/monitors/fetch-reference-price] ${message}`);
    return jsonError("Failed to fetch Idealo B-Ware price", 500);
  }
}
