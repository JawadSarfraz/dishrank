/**
 * pg_trgm's similarity() in memory: lowercase alphanumeric words, each padded "  word ", Jaccard
 * similarity of the trigram sets. Matches the SQL function on cleaned ASCII text
 * (tests/unit/matching/trigram-db.test.ts checks the parity).
 */
export function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

export function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}
