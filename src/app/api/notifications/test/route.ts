import { prisma } from "@/db/prisma";
import { jsonError, jsonOk, jsonValidationError } from "@/lib/api";
import { testNotificationSchema } from "@/lib/schemas/notification";
import { dispatchDealNotification } from "@/services/notifications";
import type { DealPayload } from "@/services/notifications/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_DEAL: DealPayload = {
  itemId: "test-item",
  title: "BayRadar test notification — Game Boy Pocket",
  price: 24.9,
  currency: "EUR",
  buyingFormat: "FIXED_PRICE",
  itemUrl: "https://www.ebay.de",
  imageUrl: null,
  bidCount: 0,
  endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  monitorName: "Test Monitor",
};

export async function POST(request: Request) {
  try {
    const parsed = testNotificationSchema.safeParse(await readOptionalJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    if (parsed.data.id) {
      const setting = await prisma.notificationSetting.findUnique({ where: { id: parsed.data.id } });
      if (!setting) {
        return jsonError("Notification setting not found", 404);
      }
    }

    const results = await dispatchDealNotification(TEST_DEAL, {
      settingId: parsed.data.id,
      includeDisabled: Boolean(parsed.data.id),
    });

    if (results.length === 0) {
      return jsonError("No notification channels are configured or enabled.", 400);
    }

    return jsonOk({
      sent: results.filter((result) => result.success).length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Invalid JSON body") {
      return jsonError(message, 400);
    }
    console.error(`[api/notifications/test] POST failed: ${message}`);
    return jsonError("Failed to send test notification", 500);
  }
}

async function readOptionalJsonBody(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}
