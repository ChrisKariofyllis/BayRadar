export const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_AI_MODEL = "gpt-4o-mini";
export const DEFAULT_AI_FALLBACK_MODEL = "gemini-3.1-flash-lite";

export const AI_PROVIDER_PRESETS = [
  {
    id: "gemini",
    label: "Google Gemini",
    aiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    aiModel: "gemini-3.5-flash-lite",
  },
  {
    id: "groq",
    label: "Groq",
    aiBaseUrl: "https://api.groq.com/openai/v1",
    aiModel: "llama-3.3-70b-versatile",
  },
  {
    id: "openai",
    label: "OpenAI",
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "gpt-4o-mini",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    aiBaseUrl: "https://openrouter.ai/api/v1",
    aiModel: "google/gemini-2.0-flash-001",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    aiBaseUrl: "https://openrouter.ai/api/v1",
    aiModel: "anthropic/claude-3-5-haiku",
  },
] as const;
