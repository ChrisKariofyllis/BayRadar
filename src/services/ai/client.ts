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
    message?: {
      content?: string | null | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
}

export interface CompleteChatOptions {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: "json_object" };
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  extraBody?: Record<string, unknown>;
}

export interface CompleteChatResult {
  content: string;
  payload: unknown;
}

export async function completeChat(options: CompleteChatOptions): Promise<string> {
  const result = await completeChatRaw(options);
  return result.content;
}

export async function completeChatRaw(options: CompleteChatOptions): Promise<CompleteChatResult> {
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

  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        model: options.model?.trim() || config.aiModel,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 400,
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
        ...(options.extraBody ?? {}),
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

  const content = extractCompletionText(payload).trim();
  if (!content) {
    throw new AiClientError("AI provider returned an empty completion.", 502);
  }
  return { content, payload };
}

export function isGeminiGoogleEndpoint(baseUrl: string): boolean {
  return /generativelanguage\.googleapis\.com/i.test(baseUrl);
}

export async function completeGeminiGenerateContent(options: {
  prompt: string;
  system?: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens?: number;
}): Promise<CompleteChatResult> {
  const endpoint = geminiGenerateContentUrl(options.baseUrl, options.model);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": options.apiKey,
      },
      signal,
      body: JSON.stringify({
        ...(options.system ? { system_instruction: { parts: [{ text: options.system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: options.prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: options.maxTokens ?? 256,
        },
      }),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AiClientError(`AI request failed: ${reason}`, 502);
  }

  const raw = await response.text();
  let payload: GeminiGenerateContentResponse | null = null;
  try {
    payload = raw ? (JSON.parse(raw) as GeminiGenerateContentResponse) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new AiClientError(
      payload?.error?.message || `AI provider returned ${response.status}: ${raw.slice(0, 280) || "no body"}`,
      response.status,
    );
  }

  const content = (payload?.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!content) {
    throw new AiClientError("AI provider returned an empty completion.", 502);
  }
  return { content, payload };
}

function geminiGenerateContentUrl(baseUrl: string, model: string): string {
  const root = trimTrailingSlash(baseUrl).replace(/\/openai$/i, "");
  return `${root}/models/${encodeURIComponent(model)}:generateContent`;
}

function extractCompletionText(payload: ChatCompletionResponse | null): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
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
