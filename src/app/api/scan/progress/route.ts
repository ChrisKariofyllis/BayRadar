import { jsonOk } from "@/lib/api";
import { getScanProgress } from "@/services/engine/scan-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonOk(getScanProgress());
}
