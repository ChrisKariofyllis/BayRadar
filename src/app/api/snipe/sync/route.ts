import { jsonError, jsonOk } from "@/lib/api";
import { syncEndedSnipeOutcomes } from "@/lib/sniper/sync-outcomes";
import { getGixenRuntimeConfig } from "@/services/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  try {
    const config = await getGixenRuntimeConfig();
    if (!config.enabled) {
      return jsonError("Gixen sniping is disabled. Enable it in Settings.", 400);
    }
    if (!config.configured) {
      return jsonError("Gixen username and password are not configured.", 400);
    }

    const summary = await syncEndedSnipeOutcomes();
    return jsonOk({ success: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/snipe/sync] POST failed: ${message}`);
    return jsonError("Failed to sync snipe outcomes", 500);
  }
}
