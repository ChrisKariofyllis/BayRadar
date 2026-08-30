export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  let payload: ({ ok?: boolean; error?: string; issues?: unknown } & T) | null = null;
  try {
    payload = (await response.json()) as { ok?: boolean; error?: string; issues?: unknown } & T;
  } catch {
    throw new ApiError(response.ok ? "Invalid JSON response" : response.statusText, response.status);
  }

  if (!response.ok || payload.ok === false) {
    throw new ApiError(payload.error || `Request failed (${response.status})`, response.status, payload.issues);
  }

  return payload;
}
