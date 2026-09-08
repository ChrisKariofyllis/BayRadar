import { getAiRuntimeConfig, isLocalAiEndpoint } from "@/services/config";

export class AiClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiClientError";
  }
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  error?: { message?: string };
}

export async function completeChat(options: {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const config = await getAiRuntimeConfig();
  if (!config.aiApiKey && !isLocalAiEndpoint(config.aiBaseUrl)) {
    throw new AiClientError(
      "AI is not configured. Add a provider base URL and API key in Settings.",
      400,
    );
  }

  const endpoint = `${trimTrailingSlash(config.aiBaseUrl)}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.aiApiKey) {
    headers.Authorization = `Bearer ${config.aiApiKey}`;
  }
  if (config.aiBaseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://github.com/ChrisKariofyllis/BayRadar";
    headers["X-Title"] = "BayRadar";
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: config.aiModel,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 400,
        messages: [
          ...(options.system ? [{ role: "system", content: options.system }] : []),
          { role: "user", content: options.prompt },
        ],
      }),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AiClientError(`AI request failed: ${reason}`, 502);
  }

  const raw = await response.text();
  let payload: ChatCompletionResponse | null = null;
  try {
    payload = raw ? (JSON.parse(raw) as ChatCompletionResponse) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new AiClientError(
      payload?.error?.message || `AI provider returned ${response.status}: ${raw.slice(0, 280) || "no body"}`,
      response.status,
    );
  }

  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new AiClientError("AI provider returned an empty completion.", 502);
  }
  return content;
}

export function parseKeywordList(raw: string): string[] {
  const fenced = raw.match(/```(?:[\w-]+)?\s*([\s\S]*?)```/);
  const cleaned = (fenced?.[1] ?? raw)
    .replace(/^[#>*]+\s*/gm, "")
    .replace(/^\d+[.)]\s+/gm, "");

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const part of cleaned.split(/[,;\n]+/)) {
    const keyword = part
      .trim()
      .toLowerCase()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s+/g, " ");
    if (!keyword || keyword.length > 48 || keyword.includes(":")) continue;
    if (seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
  }
  return keywords;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
