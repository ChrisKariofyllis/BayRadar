import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { executePollCycle } from "@/services/engine/poller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handlePoll(request);
}

export async function POST(request: Request) {
  return handlePoll(request);
}

async function handlePoll(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await executePollCycle();
    return NextResponse.json({
      ok: true,
      mode: "serverless",
      ...summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cron/poll] Cycle failed: ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.warn("[cron/poll] CRON_SECRET is not set; allowing request without authorization.");
    return true;
  }

  const header = request.headers.get("authorization");
  if (!header) return false;

  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
  return safeEqual(presented, secret);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
