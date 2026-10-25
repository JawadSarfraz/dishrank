// Launch dishes to pre-tick on the import Create form (docs/07 §2), from the place's name and
// Overture category. Only hints: the admin unticks what the place does not serve, and a ticked dish
// is a CANDIDATE that never ranks without votes.
import { cleanText, indexOfPhrase, tokenize } from "../matching/normalize";

/** A dish alias as stored in DishAlias (docs/05 step 1 normal form). */
export type DishAliasRow = { alias: string; dishSlug: string };

/** "nashta" (breakfast) does not say the place serves halwa puri. */
const SKIPPED_ALIASES = new Set(["nashta"]);

/** "Sabzi Mandi", "Mandi Road": a market or a road, not the Arabic dish. */
const NOT_A_DISH: Record<string, { before: readonly string[]; after: readonly string[] }> = {
  mandi: {
    before: ["sabzi", "sabz", "bakar", "bakra", "namak", "ganj", "gawal", "cow", "fruit", "ghalla"],
    after: ["road", "rd", "more", "morr", "mor", "station", "bazar", "bazaar"],
  },
};

/** A signboard "karahi" without the meat word: karahi houses serve both. */
// DECISION-PENDING: bare "karahi" pre-ticks both Chicken Karahi and Mutton Karahi.
const KARAHI_WORDS = ["karahi", "karhai", "kadai", "kadhai", "karai", "kerahi"];
const KARAHI_DISHES = ["chicken-karahi", "mutton-karahi"];
const KARAHI_FAMILY = new Set([...KARAHI_DISHES, "namkeen-gosht"]);

/** Overture categories that name a launch dish. */
export const CATEGORY_DISHES: Readonly<Record<string, string>> = {
  pizza_restaurant: "pizza",
  burger_restaurant: "beef-burger",
  tea_room: "chai",
};

function hasPhrase(tokens: readonly string[], phrase: readonly string[]): boolean {
  const rule = phrase.length === 1 ? NOT_A_DISH[phrase[0]] : undefined;
  for (let i = indexOfPhrase(tokens, phrase); i !== -1; i = indexOfPhrase(tokens, phrase, i + 1)) {
    if (!rule) return true;
    if (!rule.before.includes(tokens[i - 1] ?? "") && !rule.after.includes(tokens[i + 1] ?? ""))
      return true;
  }
  return false;
}

/**
 * Dish slugs suggested by a place's name (any alias of the dish as whole words, e.g. "Karachi
 * Biryani and Broast" → chicken-biryani, broast) and categories (pizza_restaurant → pizza).
 * `aliases` should be the launch dishes' aliases.
 */
export function suggestDishes(
  name: string,
  categories: readonly (string | null)[],
  aliases: readonly DishAliasRow[],
): Set<string> {
  const tokens = tokenize(cleanText(name));
  const found = new Set<string>();
  for (const { alias, dishSlug } of aliases) {
    const phrase = tokenize(cleanText(alias));
    if (phrase.length === 0 || SKIPPED_ALIASES.has(phrase.join(" "))) continue;
    if (hasPhrase(tokens, phrase)) found.add(dishSlug);
  }
  const knownDishes = new Set(aliases.map((a) => a.dishSlug));
  if (
    ![...found].some((slug) => KARAHI_FAMILY.has(slug)) &&
    tokens.some((t) => KARAHI_WORDS.includes(t))
  ) {
    for (const slug of KARAHI_DISHES) if (knownDishes.has(slug)) found.add(slug);
  }
  for (const category of categories) {
    const slug = category ? CATEGORY_DISHES[category] : undefined;
    if (slug && knownDishes.has(slug)) found.add(slug);
  }
  return found;
}
