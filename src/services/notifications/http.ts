const DEFAULT_TIMEOUT_MS = 12_000;

export async function fetchNotification(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 400);
    throw new Error(`${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
  }

  return response;
}

export function failedResult(provider: string, error: unknown): { success: false; provider: string; error: string } {
  return {
    success: false,
    provider,
    error: error instanceof Error ? error.message : String(error),
  };
}
