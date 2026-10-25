// docs/05 step 1. Size words come from seed/variant-tags.json at build time.
import variantTags from "../../../../seed/variant-tags.json";

/** Lowercase ASCII words separated by single spaces: unaccent, "&" → "and", every other non-alphanumeric → space. */
export function cleanText(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining accents (é → e)
    .toLowerCase()
    .replace(/[^\x00-\x7f]/g, "") // anything still non-ASCII (e.g. Urdu script)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return text.split(" ").filter(Boolean);
}

/** Size phrases as token lists, longest first (by word count, then length). */
const SIZE_PHRASES: readonly string[][] = [
  ...new Set(variantTags.size_words_strip_only.map(cleanText).filter(Boolean)),
]
  .map(tokenize)
  .sort((a, b) => b.length - a.length || b.join(" ").length - a.join(" ").length);

const PRICE_TOKEN = /^(\d+|rs|pkr)$/;

/** Index of `phrase` as consecutive whole tokens in `tokens`, or -1. */
export function indexOfPhrase(
  tokens: readonly string[],
  phrase: readonly string[],
  from = 0,
): number {
  outer: for (let i = from; i + phrase.length <= tokens.length; i++) {
    for (let k = 0; k < phrase.length; k++) if (tokens[i + k] !== phrase[k]) continue outer;
    return i;
  }
  return -1;
}

/**
 * docs/05 step 1: "Chicken White Karahi Full 1kg Rs 2400" → "chicken white karahi".
 * Variant words and meat words stay in the text; size phrases, prices and bare numbers go.
 */
export function normalize(raw: string): string {
  let tokens = tokenize(cleanText(raw));
  for (const phrase of SIZE_PHRASES) {
    let i: number;
    while ((i = indexOfPhrase(tokens, phrase)) !== -1) {
      tokens = [...tokens.slice(0, i), ...tokens.slice(i + phrase.length)];
    }
  }
  return tokens.filter((t) => !PRICE_TOKEN.test(t)).join(" ");
}
