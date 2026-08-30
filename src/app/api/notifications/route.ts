import type { NotificationSetting } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { upsertNotificationSchema } from "@/lib/schemas/notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await prisma.notificationSetting.findMany({
    orderBy: { createdAt: "asc" },
  });

  return jsonOk({
    notifications: settings.map(toPublicSetting),
  });
}

export async function POST(request: Request) {
  try {
    const parsed = upsertNotificationSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    const { id, ...data } = parsed.data;
    if (isMaskedSecret(data.authToken)) {
      delete data.authToken;
    }
    const setting = id
      ? await prisma.notificationSetting.update({ where: { id }, data })
      : await prisma.notificationSetting.create({ data });

    return jsonOk({ notification: toPublicSetting(setting) }, id ? 200 : 201);
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    if (isMissingRecord(error)) {
      return jsonError("Notification setting not found", 404);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/notifications] POST failed: ${message}`);
    return jsonError("Failed to save notification setting", 500);
  }
}

function toPublicSetting(setting: NotificationSetting) {
  return {
    ...setting,
    authToken: maskSecret(setting.authToken),
    hasAuthToken: Boolean(setting.authToken),
  };
}

function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

function isMaskedSecret(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("••••");
}

function isMissingRecord(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}
