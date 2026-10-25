/**
 * Lowercase ASCII slug with hyphens (CLAUDE.md conventions): slugify("Butt Karahi", "F-7") →
 * "butt-karahi-f-7". Accents are folded; anything not a-z/0-9 separates words; non-Latin script is
 * dropped (no transliteration in v1). Returns "" when nothing usable is left.
 */
export function slugify(...parts: string[]): string {
  return parts
    .join(" ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
