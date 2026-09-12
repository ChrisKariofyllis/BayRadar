import { BodyParseError, jsonError, jsonOk, jsonValidationError, readJsonBody } from "@/lib/api";
import { gixenSettingsSchema } from "@/lib/schemas/gixen-settings";
import { getGixenRuntimeConfig } from "@/services/config";
import { prisma } from "@/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getGixenRuntimeConfig();
  return jsonOk({
    username: config.username,
    hasPassword: Boolean(config.password),
    enabled: config.enabled,
    configured: config.configured,
    handshakeOk: config.handshakeOk,
    handshakeAt: config.handshakeAt,
    mirrorActive: config.mirrorActive,
  });
}

export async function POST(request: Request) {
  try {
    const parsed = gixenSettingsSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return jsonValidationError(parsed.error);
    }

    const current = await getGixenRuntimeConfig();
    const incomingPassword = parsed.data.password?.trim() ?? "";
    const nextPassword =
      incomingPassword && !incomingPassword.startsWith("••••") ? incomingPassword : current.password;

    if (!nextPassword) {
      return jsonError("Password is required the first time you save Gixen credentials.", 400);
    }

    const credentialsChanged =
      parsed.data.username !== current.username || Boolean(incomingPassword && !incomingPassword.startsWith("••••"));

    await prisma.gixenSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        username: parsed.data.username,
        password: nextPassword,
        enabled: parsed.data.enabled,
        handshakeOk: false,
        handshakeAt: null,
        mirrorActive: false,
        sessionCookie: null,
        sessionId: null,
      },
      update: {
        username: parsed.data.username,
        password: nextPassword,
        enabled: parsed.data.enabled,
        ...(credentialsChanged
          ? {
              handshakeOk: false,
              handshakeAt: null,
              mirrorActive: false,
              sessionCookie: null,
              sessionId: null,
            }
          : {}),
      },
    });

    const saved = await getGixenRuntimeConfig();
    return jsonOk({
      saved: true,
      username: saved.username,
      hasPassword: Boolean(saved.password),
      enabled: saved.enabled,
      configured: saved.configured,
      handshakeOk: saved.handshakeOk,
      handshakeAt: saved.handshakeAt,
      mirrorActive: saved.mirrorActive,
    });
  } catch (error) {
    if (error instanceof BodyParseError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/settings/gixen] POST failed: ${message}`);
    return jsonError("Failed to save Gixen settings", 500);
  }
}
