import { prisma } from "@/db/prisma";
import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { cancelSnipeSchema, createSnipeSchema } from "@/lib/schemas/snipe";
import {
  ACTIVE_SNIPE_STATUSES,
  armListingSnipe,
  findSnipeListing,
  toPublicSnipe,
} from "@/lib/sniper/arm";
import { cancelSnipe } from "@/lib/sniper/gixen";
import { getGixenRuntimeConfig } from "@/services/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const parsed = createSnipeSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    const result = await armListingSnipe(parsed.data.listingId, parsed.data.maxBid, {
      endsAt: parsed.data.endsAt,
    });

    if (!result.success && !result.snipe) {
      const error = result.error || "Failed to schedule snipe";
      const status = statusForArmError(error);
      return jsonError(error, status);
    }

    return jsonOk({
      success: result.success,
      snipeId: result.snipeId,
      error: result.error,
      snipe: result.snipe,
    });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/snipe] POST failed: ${message}`);
    return jsonError("Failed to schedule snipe", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const parsed = cancelSnipeSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    const listing = await findSnipeListing(parsed.data.listingId);
    if (!listing) {
      return jsonError("Listing not found", 404);
    }

    const task = listing.snipeTask;
    if (!task || !ACTIVE_SNIPE_STATUSES.includes(task.status)) {
      return jsonError("No active snipe is armed for this listing.", 400);
    }

    const config = await getGixenRuntimeConfig();
    if (!config.enabled) {
      return jsonError("Gixen sniping is disabled. Enable it in Settings.", 400);
    }
    if (!config.configured) {
      return jsonError("Gixen username and password are not configured.", 400);
    }

    const result = await cancelSnipe(listing.itemId);
    if (!result.success) {
      return jsonOk({
        success: false,
        error: result.error || "Gixen did not remove the snipe.",
        snipe: toPublicSnipe(task),
      });
    }

    const cancelled = await prisma.snipeTask.update({
      where: { id: task.id },
      data: {
        status: "CANCELLED",
        executionLog: `Cancelled via Gixen${result.snipeId ? ` (${result.snipeId})` : ""}`,
      },
    });

    return jsonOk({
      success: true,
      snipe: toPublicSnipe(cancelled),
    });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/snipe] DELETE failed: ${message}`);
    return jsonError("Failed to cancel snipe", 500);
  }
}

function statusForArmError(error: string): number {
  if (error === "Listing not found") return 404;
  return 400;
}
