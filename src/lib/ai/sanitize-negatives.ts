const META_BLACKLIST = new Set([
  "etc",
  "wait",
  "exclude",
  "devices",
  "variations",
  "brands",
  "brand",
  "keyword",
  "keywords",
  "negative",
  "negatives",
  "budget",
  "conflicting",
  "standalone",
  "device",
  "listing",
  "listings",
]);

const STANDALONE_BLOCKLIST = new Set(["ovp"]);

const FORBIDDEN_CHARS = /["'`[\](){}:;,!?./\\|*^=<>~@#$%]/;

export function tokenizeQuery(query: string): Set<string> {
  return new Set(
    query
      .toLowerCase()
      .split(/[^\p{L}\p{N}+]+/u)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function parseNegativesJson(raw: string): string[] {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return [];

  try {
    const body = JSON.parse(jsonText) as { negatives?: unknown };
    if (!Array.isArray(body.negatives)) return [];
    return body.negatives.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function sanitizeNegativeKeywords(raw: string[], query: string): string[] {
  const queryWords = tokenizeQuery(query);
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const value of raw) {
    const keyword = normalizeKeyword(value);
    if (!keyword) continue;
    if (seen.has(keyword)) continue;
    if (!isAllowedKeyword(keyword, queryWords)) continue;
    seen.add(keyword);
    keywords.push(keyword);
  }

  return keywords;
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isAllowedKeyword(keyword: string, queryWords: Set<string>): boolean {
  if (keyword.length < 3 || keyword.length > 24) return false;
  if (FORBIDDEN_CHARS.test(keyword)) return false;
  if (STANDALONE_BLOCKLIST.has(keyword)) return false;
  if (/^\d+$/.test(keyword)) return false;

  const tokens = keyword.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  for (const token of tokens) {
    if (token.length < 2) return false;
    if (META_BLACKLIST.has(token)) return false;
    if (queryWords.has(token)) return false;
    if (/^\d+$/.test(token)) return false;
  }

  return true;
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return null;
}
