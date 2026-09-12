import { jsonOk } from "@/lib/api";
import { testGixenConnection } from "@/lib/sniper/gixen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST() {
  try {
    const result = await testGixenConnection();
    return jsonOk({
      success: result.success,
      message: result.message,
      handshakeOk: result.handshakeOk,
      mirrorActive: result.mirrorActive,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/settings/gixen/test] ${message}`);
    return jsonOk({ success: false, message, handshakeOk: false, mirrorActive: false }, 200);
  }
}
