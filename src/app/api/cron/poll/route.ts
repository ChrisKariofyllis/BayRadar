import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { syncEndedSnipeOutcomes } from "@/lib/sniper/sync-outcomes";
import { BACKGROUND_SEARCH_LIMIT, executePollCycle, MANUAL_SEARCH_LIMIT } from "@/services/engine/poller";

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

  const options = await readPollOptions(request);

  try {
    const summary = await executePollCycle({
      ...options,
      searchLimit: options.searchLimit ?? (isSameOrigin(request) ? MANUAL_SEARCH_LIMIT : BACKGROUND_SEARCH_LIMIT),
    });
    const snipes = await syncEndedSnipeOutcomes().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cron/poll] Snipe outcome sync failed: ${message}`);
      return null;
    });
    return NextResponse.json({
      ok: true,
      mode: "serverless",
      reset: Boolean(options.reset),
      ...summary,
      ...(snipes ? { snipeSync: snipes } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cron/poll] Cycle failed: ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function readPollOptions(
  request: Request,
): Promise<{ reset?: boolean; monitorId?: string; searchLimit?: number }> {
  const url = new URL(request.url);
  let reset = parseTruthy(url.searchParams.get("reset"));
  let monitorId = url.searchParams.get("monitorId")?.trim() || undefined;

  if (request.method === "GET") {
    return { reset, monitorId };
  }

  try {
    const body = (await request.json()) as { reset?: unknown; monitorId?: unknown };
    if (parseTruthy(body.reset)) reset = true;
    if (typeof body.monitorId === "string" && body.monitorId.trim()) {
      monitorId = body.monitorId.trim();
    }
  } catch {
    // Manual scans may send an empty body.
  }

  return { reset, monitorId };
}

function parseTruthy(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

function isSameOrigin(request: Request): boolean {
  return request.headers.get("sec-fetch-site") === "same-origin";
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (isSameOrigin(request)) {
    return true;
  }

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
