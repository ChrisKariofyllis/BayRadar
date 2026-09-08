const STORAGE_COMPACT = /(\d+)(gb|tb|mb)\b/gi;

export function expandEbaySearchQuery(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const withAliases = expandPlaystation5(trimmed);
  return expandCompactStorage(withAliases).replace(/\s+/g, " ").trim();
}

function expandCompactStorage(query: string): string {
  return query.replace(STORAGE_COMPACT, (_all, amount: string, unit: string) => {
    const normalizedUnit = unit.toUpperCase();
    return `(${amount}${normalizedUnit}, "${amount} ${normalizedUnit}")`;
  });
}

function expandPlaystation5(query: string): string {
  if (/\(\s*PS5\s*,/i.test(query)) return query;
  return query.replace(/\bPS5\b/gi, '(PS5, "PlayStation 5")');
}
