// docs/05 step 3: classify the words left over after the alias match. Word lists come from
// seed/variant-tags.json and seed/meat-words.json at build time.
import meatWords from "../../../../seed/meat-words.json";
import variantTags from "../../../../seed/variant-tags.json";
import { cleanText, tokenize } from "./normalize";

export const STOP_WORDS: ReadonlySet<string> = new Set([
  "and",
  "with",
  "n",
  "e",
  "ka",
  "ki",
  "ke",
  "of",
  "the",
  "wala",
  "wali",
  "style",
]);

type TagPhrase = { tag: string; tokens: string[] };

/** Variant-tag words and phrases, longest first. */
const TAG_PHRASES: readonly TagPhrase[] = Object.entries(variantTags.tags)
  .flatMap(([tag, words]) => words.map((w) => ({ tag, tokens: tokenize(cleanText(w)) })))
  .filter((p) => p.tokens.length > 0)
  .sort(
    (a, b) =>
      b.tokens.length - a.tokens.length || b.tokens.join(" ").length - a.tokens.join(" ").length,
  );

const MEAT_OF: ReadonlyMap<string, string> = new Map(
  Object.entries(meatWords.meat).flatMap(([meat, words]) =>
    words.map((w) => [cleanText(w), meat] as const),
  ),
);

const NEEDS_MEAT: ReadonlySet<string> = new Set(meatWords.needs_meat.map(cleanText));

/** The meat a word names ("murgh" → "chicken"), if any. */
export function meatOf(word: string): string | undefined {
  return MEAT_OF.get(word);
}

/** Meats named by any of the words (a dish's meat is the meat in its name: Namkeen Gosht → mutton). */
export function meatsIn(words: Iterable<string>): Set<string> {
  const meats = new Set<string>();
  for (const w of words) {
    const m = MEAT_OF.get(w);
    if (m) meats.add(m);
  }
  return meats;
}

/** Meat-word safety (docs/05): a dish word that needs a meat is present, but no meat word is. */
export function lacksNeededMeat(tokens: readonly string[]): boolean {
  return tokens.some((t) => NEEDS_MEAT.has(t)) && !tokens.some((t) => MEAT_OF.has(t));
}

export type DishWords = { nameWords: ReadonlySet<string>; meats: ReadonlySet<string> };

export type Leftovers = { tags: string[]; unknown: string[]; conflicts: string[] };

function tagAt(part: readonly string[], k: number): TagPhrase | undefined {
  return TAG_PHRASES.find((p) => p.tokens.every((t, i) => part[k + i] === t));
}

/**
 * Leftover words = the text minus the matched alias (`span` is [start, end) in `tokens`).
 * Own-name and stop words are ignored; tag phrases become tags; a meat word of a different meat
 * than the dish's is a conflict (dishes whose name names no meat accept any); the rest is unknown.
 */
export function classifyLeftovers(
  tokens: readonly string[],
  span: readonly [number, number],
  dish: DishWords,
): Leftovers {
  const result: Leftovers = { tags: [], unknown: [], conflicts: [] };
  for (const part of [tokens.slice(0, span[0]), tokens.slice(span[1])]) {
    let k = 0;
    while (k < part.length) {
      const word = part[k]!;
      if (dish.nameWords.has(word) || STOP_WORDS.has(word)) {
        k += 1;
        continue;
      }
      const phrase = tagAt(part, k);
      if (phrase) {
        if (!result.tags.includes(phrase.tag)) result.tags.push(phrase.tag);
        k += phrase.tokens.length;
        continue;
      }
      const meat = MEAT_OF.get(word);
      if (meat) {
        if (dish.meats.size > 0 && !dish.meats.has(meat)) result.conflicts.push(word);
      } else {
        result.unknown.push(word);
      }
      k += 1;
    }
  }
  return result;
}

/** Tags anywhere in the text (used when the dish came from the LLM, which has no alias span). */
export function tagsInText(tokens: readonly string[], dish: DishWords): string[] {
  return classifyLeftovers(tokens, [0, 0], dish).tags;
}
