export const ACCESSORY_JUNK_KEYWORDS = [
  "hülle",
  "case",
  "panzerglas",
  "schutzfolie",
  "tasche",
  "zubehör",
  "defekt",
  "dummy",
  "ovp",
  "nur karton",
  "kabel",
  "adapter",
] as const;

export function mergeKeywordInput(current: string, extras: readonly string[]): string {
  const existing = current
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set(existing.map((item) => item.toLowerCase()));
  const next = [...existing];

  for (const extra of extras) {
    const key = extra.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(extra);
  }

  return next.join(", ");
}
