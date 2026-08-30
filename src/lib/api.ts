import { NextResponse } from "next/server";
import { flattenError, type ZodError } from "zod";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...unwrapData(data) }, { status });
}

export function jsonError(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export function jsonValidationError(error: ZodError) {
  return jsonError("Validation failed", 400, { issues: flattenError(error) });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BodyParseError();
  }
}

export class BodyParseError extends Error {
  constructor() {
    super("Invalid JSON body");
    this.name = "BodyParseError";
  }
}

function unwrapData<T>(data: T): T extends Record<string, unknown> ? T : { data: T } {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as T extends Record<string, unknown> ? T : { data: T };
  }
  return { data } as T extends Record<string, unknown> ? T : { data: T };
}
