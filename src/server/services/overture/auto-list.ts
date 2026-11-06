// The Auto-list rules (docs/07 §2a): which staged Overture places become public restaurants without
// a per-place review, under what name and with which dish links. Pure: auto-list.service loads the
// rows and writes the result. A name is only ever shortened or re-cased, never made up, and a place
// these rules cannot judge stays NEW for /admin/import.
import type { LatLng } from "@/lib/geo";
import { cleanText, indexOfPhrase, tokenize } from "../matching/normalize";
import {
  NearbyIndex,
  metresBetween,
  nameKey,
  sameKeys,
  similarKeys,
  type DedupeRestaurant,
} from "./duplicates";
import { compareReleases } from "./places";

export const AUTO_LIST = {
  /**
   * Overture's existence score. Chosen from the data (docs/07 §2a): from 0.6 up the records are
   * visibly fuller (phone 79% → 87%, website 15% → 26%), and named nihari and karahi houses still
   * make it; below it are more Facebook-only pages.
   */
  minConfidence: 0.6,
  /** RestaurantDish.confidence of a link read from the name or category (an admin's tick is 0.4). */
  dishConfidence: 0.3,
  /** A longer "name" is a sentence or a list of keywords: left for a person. */
  maxNameLength: 80,
  /** Restaurants one Apply request creates; the page calls it until none are left. */
  batchSize: 100,
  /** Similar names this close are one place: wider than /admin/import's 50 m hint, because nobody looks first. */
  similarNameMetres: 300,
  /** The same name this close is one place too; a real second branch stays NEW for a person. */
  sameNameMetres: 1000,
  /** Names that start with the same distinctive word this close: "Cafe Trieste", "Trieste Bahria Town". */
  sameBrandMetres: 60,
} as const;

/**
 * Overture categories that are places to eat or drink. Every candidate is under food_and_drink, but
 * the bare "food_and_drink" says nothing about the place (a flour mill, an HR consultant), and shops
 * selling packaged sweets or internet time have no dish to rate. A category not on this list stays
 * NEW, so a new one in a later release is never published unseen.
 */
export const AUTO_LIST_CATEGORIES: ReadonlySet<string> = new Set([
  "afghani_restaurant",
  "american_restaurant",
  "arabian_restaurant",
  "asian_fusion_restaurant",
  "asian_restaurant",
  "bagel_shop",
  "bakery",
  "bar_and_grill_restaurant",
  "barbecue_restaurant",
  "basque_restaurant",
  "brazilian_restaurant",
  "breakfast_and_brunch_restaurant",
  "british_restaurant",
  "bubble_tea_shop",
  "buffet_restaurant",
  "burger_restaurant",
  "cafe",
  "chicken_restaurant",
  "chinese_restaurant",
  "coffee_shop",
  "comfort_food_restaurant",
  "dessert_shop",
  "diner",
  "donut_shop",
  "doner_kebab_restaurant",
  "european_restaurant",
  "fast_food_restaurant",
  "fish_and_chips_restaurant",
  "food_truck_stand",
  "frozen_yogurt_shop",
  "halal_restaurant",
  "health_food_restaurant",
  "hot_dog_restaurant",
  "ice_cream_shop",
  "indian_restaurant",
  "italian_restaurant",
  "japanese_restaurant",
  "korean_restaurant",
  "lebanese_restaurant",
  "mediterranean_restaurant",
  "mexican_restaurant",
  "middle_eastern_restaurant",
  "pakistani_restaurant",
  "persian_restaurant",
  "pizza_restaurant",
  "restaurant",
  "sandwich_shop",
  "seafood_restaurant",
  "shaved_ice_shop",
  "smoothie_juice_bar",
  "soul_food",
  "soup_restaurant",
  "steakhouse",
  "sushi_restaurant",
  "tea_room",
  "thai_restaurant",
  "theme_restaurant",
  "turkish_restaurant",
]);

// ---------- names ----------

const CITY_WORDS = "islamabad|rawalpindi|pindi|isb|rwp|pakistan";
const LEGAL_WORDS =
  "\\(?\\s*(?:pvt|pvt\\.|private)\\s*\\)?\\.?\\s*(?:ltd|ltd\\.|limited)?\\.?|ltd\\.?|limited|smc|llc|inc\\.?";

/** A trailing city ("…, Islamabad", "… in Pindi", "….islamabad", "( Saddar Rawalpindi )"). */
const TRAILING_CITY = new RegExp(
  `[\\s,;:.|/\\\\()\\-–—]*(?:\\bin\\s+)?\\b(?:${CITY_WORDS})\\b[\\s.,;:|)\\]]*$`,
  "iu",
);
/** Words that belong to a company register or a Facebook page, not to the signboard. */
const TRAILING_LEGAL = new RegExp(
  `[\\s,;:.|/\\\\\\-–—]*(?:\\bofficial(?:\\s+(?:page|account))?\\b|(?<![\\p{L}\\p{N}])(?:${LEGAL_WORDS})(?![\\p{L}\\p{N}]))[\\s.,;:|)\\]]*$`,
  "iu",
);

/** Words that say what kind of place it is, not which one: a name of only these is no name. */
const GENERIC_WORDS = new Set(
  (
    "a and bakers bakery bar best biryani breakfast burger burgers cafe cake cakes canteen center " +
    "centre chai chinese coffee corner court cuisine desi dhaba dine diner dining eat eatery family " +
    "fast fine food foods fresh good grill hot hotel house juice karahi kitchen lounge new of " +
    "pakistani park pizza place point quality refreshment refreshments resturant restaurant " +
    "restaurants shop snack snacks special spot stall street sweets take takeaway tea the town " +
    "traditional"
  ).split(" "),
);

/** A name cannot end on these: "Taste of Pakistan" is a name, and "Taste of" is not. */
const DANGLING_WORDS = new Set("al and at by de e el for in of the ul".split(" "));

/**
 * Words that do not tell one place from another at the start of a name: the generic ones, connectors,
 * and the regions and dishes many unrelated places open with ("Quetta Bilal Cafe", "Tikka Mehal").
 */
const NOT_A_BRAND = new Set([
  ...GENERIC_WORDS,
  ...(
    "al e el la ms mr n s the de afghan afghani balochi bannu bbq beef broast chicken cream fish " +
    "hunza ice kabab kabul karachi kebab lahore lahori mandi murgh mutton nihari peshawar peshawari " +
    "pulao punjab quetta roll rolls shanwari shawarma shinwari sindhi sweet tandoori tikka wok"
  ).split(" "),
]);

/** Words that say the record is not a place to eat, unless the name also says it serves food. */
const NOT_EATING_WORDS = new Set(
  (
    "academy apartment apartments bank boutique calony car chowk clinic club college colony " +
    "consultant consultants department detailing distribution distributor distributors " +
    "electronics estate farm farms flats flour garments hospital hostel institute international " +
    "marketing masjid mill mills mobile mosque pharmacy poultry properties road school society " +
    "solutions traders trading travel travels university village wholesale"
  ).split(" "),
);
const FOOD_WORDS = new Set(
  (
    "bakers bakery bakeshop bbq biryani broast burger burgers cafe cake cakes canteen chaaye chai " +
    "chaye chicken coffee dhaba diner eatery fish food foods grill juice karahi kabab kebab khana " +
    "kitchen naan nihari paratha pizza pulao restaurant restaurants resturant shawarma shinwari " +
    "sweets tea tikka"
  ).split(" "),
);
/** Word pairs that name something else even with a food word in them ("Silver Oaks Net Cafe"). */
const NOT_EATING_PHRASES = [
  "cash and carry",
  "guest house",
  "internet cafe",
  "marriage hall",
  "net cafe",
  "pedestrian street",
  "shoe shop",
  "wedding hall",
].map(tokenize);

/** Two-letter words that are words, not initials ("MR COD" → "Mr Cod", but "UG HOUSE" → "UG House"). */
const SHORT_WORDS = new Set(["al", "by", "de", "el", "mr", "ms", "of"]);
/** Initials with a vowel or more than three letters, which stay in capitals. */
const INITIALS = new Set(["bbq", "dha", "kfc", "numl", "nust", "optp", "ptdc", "pwd", "wtc"]);

const LATIN_LETTER = /\p{Script=Latin}/u;
const ANY_LETTER = /\p{L}/u;

const countLetters = (text: string, test: (c: string) => boolean) => [...text].filter(test).length;

function capitalise(word: string): string {
  const lower = word.toLowerCase();
  const first = lower.search(ANY_LETTER);
  return first === -1
    ? lower
    : lower.slice(0, first) + lower[first]!.toUpperCase() + lower.slice(first + 1);
}

/** One word written all in capitals: initials ("SFK", "UG") stay, the rest gets a capital first letter. */
function fixCapsWord(word: string, alone: boolean): string {
  const letters = word.replace(/[^\p{L}]/gu, "");
  const lower = letters.toLowerCase();
  if (INITIALS.has(lower)) return word;
  if (alone && letters.length <= 4) return word; // "OTT", "PYRA": no telling, so left as written.
  if (letters.length <= 2 && !SHORT_WORDS.has(lower)) return word;
  if (letters.length === 3 && !/[aeiou]/.test(lower)) return word;
  return word.split("-").map(capitalise).join("-");
}

/** "PIZZA KING" → "Pizza King", "lahoree chatkhara" → "Lahoree Chatkhara", "Italian PIZZA" → "Italian Pizza". */
function fixCase(name: string): string {
  const hasLower = /\p{Ll}/u.test(name);
  const hasUpper = /\p{Lu}/u.test(name);
  const words = name.split(" ");
  if (hasUpper && !hasLower) {
    return words.map((w) => fixCapsWord(w, words.length === 1)).join(" ");
  }
  if (hasLower && !hasUpper) return words.map(capitalise).join(" ");
  return words
    .map((w) => {
      // Only long words: a short one in a mixed name is initials as often as not ("Steak by CFU").
      const letters = w.replace(/[^\p{L}]/gu, "");
      return letters.length >= 4 && !/\p{Ll}/u.test(letters) ? fixCapsWord(w, false) : w;
    })
    .join(" ");
}

/** Stray separators at the ends; the dot of a short abbreviation ("The Burger Co.") stays. */
const tidyEnds = (name: string) =>
  name
    .replace(/(?:['"._]\s*){2,}$/u, "")
    .replace(/^[\s,;:|/\\.\-–—]+/u, "")
    .replace(/[\s,;:|/\\\-–—]+$/u, "")
    .replace(/(?<!(?:^|[^\p{L}])\p{L}{1,3})[.\s]+$/u, "");

/** "Buddies ( Commercial Market" → "Buddies (Commercial Market)". */
function balanceBrackets(name: string): string {
  const opened = (name.match(/\(/g) ?? []).length - (name.match(/\)/g) ?? []).length;
  const closed = opened > 0 ? `${name}${")".repeat(opened)}` : name;
  return closed
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s*\(\)/g, "");
}

/** True when every word only says what kind of place it is ("Cake Shop", "Food Court"). */
export function isGenericName(name: string): boolean {
  return tokenize(cleanText(name)).every((w) => GENERIC_WORDS.has(w) || /^\d+$/.test(w));
}

/** A translation in another script at either end: "Niaz Café - نیاز کیفے" → "Niaz Café". */
function dropOtherScriptEnds(name: string): string {
  const words = name.split(" ");
  const isOther = (word: string) => {
    const letters = countLetters(word, (c) => ANY_LETTER.test(c));
    return letters > 0 && countLetters(word, (c) => LATIN_LETTER.test(c)) === 0;
  };
  const isMark = (word: string) => !ANY_LETTER.test(word) && !/\d/.test(word);
  let end = words.length;
  while (end > 0 && (isOther(words[end - 1]!) || isMark(words[end - 1]!))) end--;
  let start = 0;
  while (start < end && (isOther(words[start]!) || isMark(words[start]!))) start++;
  // A word glued to its translation: "Centerشاہی" → "Center".
  return words
    .slice(start, end)
    .join(" ")
    .replace(/(?<=\p{Script=Latin})\p{Script=Arabic}+$/u, "");
}

/**
 * The signboard name from Overture's: symbols and emojis out, another script out at the ends, a
 * tagline after "|" out, trailing city names, "Official" and company words out, all-caps fixed. Null
 * when no usable Latin name is left. Nothing is ever added: every word comes from the original.
 */
export function cleanPlaceName(raw: string): string | null {
  let name = raw
    // Before NFKC, which would turn ™ into the letters "TM": a word the original never had.
    .replace(/[\p{Extended_Pictographic}\u{2120}\u{FE0F}\u{200D}\u{20E3}]/gu, " ")
    .normalize("NFKC")
    .replace(/_/g, " ")
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  name = name.split(/\s*\|\s*/)[0]!.trim();
  // "L U N A R" → "LUNAR".
  name = name.replace(/(?<![\p{L}\p{N}])(?:\p{L} ){2,}\p{L}(?![\p{L}\p{N}])/gu, (m) =>
    m.replace(/ /g, ""),
  );
  name = dropOtherScriptEnds(name);

  for (;;) {
    const withoutLegal = name.replace(TRAILING_LEGAL, "");
    if (withoutLegal !== name && withoutLegal.trim()) {
      name = withoutLegal;
      continue;
    }
    const withoutCity = name.replace(TRAILING_CITY, "");
    if (withoutCity === name) break;
    if (!tokenize(cleanText(withoutCity)).length) return null; // only a city name
    if (isGenericName(withoutCity)) break; // "Cake Shop Islamabad" keeps its city
    const lastWord = tokenize(cleanText(withoutCity)).at(-1)!;
    if (DANGLING_WORDS.has(lastWord)) break; // "Shan-e-Pakistan" keeps it too
    name = withoutCity;
  }
  name = balanceBrackets(tidyEnds(name)).replace(/\s+/g, " ").trim();
  // Mostly another script, or not enough letters to read ("ΛMΛYΛ"): for a person to spell.
  const latin = countLetters(name, (c) => LATIN_LETTER.test(c));
  const other = countLetters(name, (c) => ANY_LETTER.test(c) && !LATIN_LETTER.test(c));
  if (latin < 2 || other * 2 > latin) return null;
  return fixCase(name);
}

/** The record names something that is not a place to eat ("Saidpur Village", "Al-Awan Marriage Hall"). */
export function looksLikeNotEating(name: string): boolean {
  const words = tokenize(cleanText(name));
  if (words.includes("restaurant")) return false;
  if (NOT_EATING_PHRASES.some((phrase) => indexOfPhrase(words, phrase) !== -1)) return true;
  return words.some((w) => NOT_EATING_WORDS.has(w)) && !words.some((w) => FOOD_WORDS.has(w));
}

// ---------- dish links ----------

type DishRule = {
  words: readonly string[];
  dishes: readonly string[];
  /** The word before says which dish ("Chicken Karahi" is not a Mutton Karahi). */
  after?: Readonly<Record<string, readonly string[]>>;
  /** The word before makes it another dish, or no dish of ours ("Bubble Tea"). */
  notAfter?: readonly string[];
  /** The word after does ("The Coffee Bean & Tea Leaf"). */
  notBefore?: readonly string[];
  /** Anywhere in the name, these say it is another dish ("Mutton Tikka and Kabab Shop"). */
  notWith?: readonly string[];
};

const BURGERS = ["beef-burger", "zinger-burger"];
const KARAHIS = ["chicken-karahi", "mutton-karahi"];
const PIZZA_WORDS = ["pizza", "pizzas", "pizzeria"];
const BURGER_WORDS = ["burger", "burgers"];
const ZINGER_WORDS = ["zinger", "zingers"];
const CHAI_WORDS = ["chai", "chaiwala", "chaiwalla", "chaye", "chaaye", "chae", "tea"];

// DECISION-PENDING: a bare "burger" links both launch burgers, as a bare "karahi" links both karahis.
const DISH_RULES: readonly DishRule[] = [
  { words: PIZZA_WORDS, dishes: ["pizza"] },
  {
    words: BURGER_WORDS,
    dishes: BURGERS,
    after: { beef: ["beef-burger"], zinger: ["zinger-burger"], chicken: ["zinger-burger"] },
  },
  { words: ZINGER_WORDS, dishes: ["zinger-burger"] },
  { words: ["broast", "broasted"], dishes: ["broast"] },
  {
    words: ["shawarma", "shawarmas", "shwarma", "shawerma"],
    dishes: ["chicken-shawarma"],
    notAfter: ["beef", "mutton"],
  },
  {
    words: CHAI_WORDS,
    dishes: ["chai"],
    notAfter: [
      "boba",
      "bubble",
      "english",
      "green",
      "herbal",
      "high",
      "ice",
      "iced",
      "lemon",
      "peach",
      "thai",
    ],
    notBefore: ["leaf", "leaves"],
  },
  {
    words: ["biryani", "biriyani", "biriani", "briyani", "beryani", "baryani"],
    dishes: ["chicken-biryani"],
    notAfter: ["beef", "mutton", "sindhi", "fish", "prawn"],
  },
  {
    words: ["karahi", "karhai", "kadai", "kadhai", "karai", "kerahi"],
    dishes: KARAHIS,
    after: {
      chicken: ["chicken-karahi"],
      murgh: ["chicken-karahi"],
      mutton: ["mutton-karahi"],
      gosht: ["mutton-karahi"],
      lamb: ["mutton-karahi"],
    },
    notAfter: ["beef", "fish", "namkeen"],
  },
  { words: ["nihari", "nehari", "nahari"], dishes: ["beef-nihari"], notAfter: ["chicken"] },
  {
    words: ["tikka", "tikkas"],
    dishes: ["chicken-tikka"],
    notAfter: ["beef", "mutton", "fish", "paneer"],
  },
  {
    words: ["kabab", "kebab", "kabob", "kababs", "kebabs"],
    dishes: ["beef-seekh-kabab"],
    after: { chapli: ["chapli-kabab"], chappal: ["chapli-kabab"] },
    notAfter: ["adana", "bun", "chicken", "doner", "fish", "pulao", "reshmi", "shami"],
    notWith: ["chicken", "fish", "mutton"],
  },
];

/**
 * Overture categories that clearly say a launch dish, unless the name speaks to it itself: then the
 * name decides ("Beef Burger Spot" is not a Zinger Burger, "Bubble Tea House" serves no chai).
 */
const CATEGORY_RULES: Readonly<
  Record<string, { dishes: readonly string[]; nameWords: readonly string[] }>
> = {
  pizza_restaurant: { dishes: ["pizza"], nameWords: PIZZA_WORDS },
  burger_restaurant: { dishes: BURGERS, nameWords: [...BURGER_WORDS, ...ZINGER_WORDS] },
  tea_room: { dishes: ["chai"], nameWords: CHAI_WORDS },
};

/**
 * Launch dishes a place's name or category clearly says, as whole words. A narrower list than the
 * Create form's pre-ticks (overture/dish-hints.ts): nobody looks at these first.
 */
export function autoListDishes(name: string, category: string | null): string[] {
  const tokens = tokenize(cleanText(name));
  const byCategory = category ? CATEGORY_RULES[category] : undefined;
  const found = new Set<string>(
    byCategory && !byCategory.nameWords.some((w) => tokens.includes(w)) ? byCategory.dishes : [],
  );
  tokens.forEach((token, i) => {
    const before = tokens[i - 1] ?? "";
    const after = tokens[i + 1] ?? "";
    for (const rule of DISH_RULES) {
      if (!rule.words.includes(token)) continue;
      if (rule.notAfter?.includes(before) || rule.notBefore?.includes(after)) continue;
      if (rule.notWith?.some((w) => tokens.includes(w))) continue;
      for (const slug of rule.after?.[before] ?? rule.dishes) found.add(slug);
    }
  });
  return [...found].sort();
}

/** An admin's hand on an auto-listed restaurant ends its "not checked" state (docs/07 §2a). */
export const checkedBy = (
  restaurant: { autoListedAt: Date | null; checkedAt: Date | null },
  now: Date,
) => (restaurant.autoListedAt && !restaurant.checkedAt ? { checkedAt: now } : {});

// ---------- the plan ----------

export type AutoListRow = {
  id: string;
  overtureId: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  confidence: number;
  lat: number | null;
  lng: number | null;
  lastSeenRelease: string;
  cityId: string;
  suggestedAreaId: string | null;
};

/** A candidate an admin or an earlier run already decided on (CREATED, LINKED, SKIPPED). */
export type ReviewedCandidate = { id: string; name: string; lat: number; lng: number };

export const HOLD_REASONS = {
  NO_LOCATION: "No real location (a placeholder point)",
  NO_AREA: "Outside our areas",
  LOW_CONFIDENCE: `Below the confidence floor of ${AUTO_LIST.minConfidence}`,
  CATEGORY: "Category is not clearly a place to eat",
  MISSING_FROM_LATEST: "Not in the latest Overture release",
  NAME: "No usable name (other script, only a kind of place, or an area)",
  NOT_EATING: "The name says it is something else",
  DUPLICATE_OF_RESTAURANT: "Likely the same place as one of our restaurants",
  DUPLICATE_OF_REVIEWED: "Likely the same place as one already reviewed",
  DUPLICATE: "Likely duplicate of a stronger candidate",
} as const;
export type HoldReason = keyof typeof HOLD_REASONS;

export type AutoListPick = AutoListRow & {
  lat: number;
  lng: number;
  suggestedAreaId: string;
  cleanName: string;
  dishSlugs: string[];
};

export type AutoListHeld = { row: AutoListRow; reason: HoldReason; cleanName: string | null };

/** The first rule that keeps a candidate out; null when it may be listed. */
function holdReason(
  row: AutoListRow,
  cleanName: string | null,
  release: string | null,
  areaKeys: ReadonlySet<string>,
): HoldReason | null {
  if (row.lat === null || row.lng === null) return "NO_LOCATION";
  if (!row.suggestedAreaId) return "NO_AREA";
  if (row.confidence < AUTO_LIST.minConfidence) return "LOW_CONFIDENCE";
  if (!row.category || !AUTO_LIST_CATEGORIES.has(row.category)) return "CATEGORY";
  if (release && compareReleases(row.lastSeenRelease, release) < 0) return "MISSING_FROM_LATEST";
  if (
    !cleanName ||
    cleanName.length > AUTO_LIST.maxNameLength ||
    isGenericName(cleanName) ||
    areaKeys.has(nameKey(cleanName))
  ) {
    return "NAME";
  }
  if (looksLikeNotEating(cleanName)) return "NOT_EATING";
  return null;
}

/** Stronger first: more confident, then the fuller record, then a stable order. */
function byStrength(a: AutoListRow, b: AutoListRow) {
  const fields = (r: AutoListRow) =>
    Number(Boolean(r.address)) + Number(Boolean(r.phone)) + Number(Boolean(r.website));
  return (
    b.confidence - a.confidence ||
    fields(b) - fields(a) ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id)
  );
}

type NamedPoint = LatLng & { keys: readonly string[]; brands: readonly string[] };
type Names = Pick<NamedPoint, "keys" | "brands">;

/**
 * Places to compare a candidate with. Each name's key is worked out once, and equal names are looked
 * up rather than scanned for: the plan runs on every Apply request and page view, over thousands of
 * names, so it has to stay cheap.
 */
class PlaceIndex {
  private readonly byKey = new Map<string, NamedPoint[]>();
  private readonly nearby = new NearbyIndex<NamedPoint>([]);

  add(point: NamedPoint) {
    this.nearby.add(point);
    for (const key of point.keys) {
      const list = this.byKey.get(key);
      if (list) list.push(point);
      else this.byKey.set(key, [point]);
    }
  }

  /**
   * Is a place here probably this one: the same name nearby, a similar name close by, or a name that
   * starts with the same distinctive word right next to it?
   */
  matches(at: LatLng, { keys, brands }: Names): boolean {
    for (const key of keys) {
      for (const point of this.byKey.get(key) ?? []) {
        if (metresBetween(at, point) <= AUTO_LIST.sameNameMetres) return true;
      }
    }
    return this.nearby
      .near(at, AUTO_LIST.similarNameMetres)
      .some(
        ({ point, metres }) =>
          keys.some((a) => point.keys.some((b) => similarKeys(a, b))) ||
          (metres <= AUTO_LIST.sameBrandMetres && brands.some((b) => point.brands.includes(b))),
      );
  }
}

/**
 * The dry run: every NEW candidate becomes a pick or is held back with its reason, and the same
 * input gives the same plan. Restaurants of every status count (one an admin closed or merged away
 * must not come back), and so do candidates already decided on: a re-run finds the place it listed
 * earlier, so its duplicates stay NEW and nothing is created twice.
 */
export function planAutoList(input: {
  candidates: readonly AutoListRow[];
  restaurants: readonly DedupeRestaurant[];
  reviewed: readonly ReviewedCandidate[];
  usedOvertureIds: ReadonlySet<string>;
  /** The newest synced release; a candidate last seen in an older one may have closed. */
  release: string | null;
  /** Seed area names: a place called just "Saddar" is an address. */
  areaNames: readonly string[];
}): { picks: AutoListPick[]; held: AutoListHeld[] } {
  const areaKeys = new Set(input.areaNames.map(nameKey));
  const areaWords = new Set(input.areaNames.flatMap((area) => tokenize(cleanText(area))));
  /** A name's first word that tells it from its neighbours; none for a name of general words. */
  const brandOf = (name: string) =>
    tokenize(cleanText(name)).find(
      (w) => !NOT_A_BRAND.has(w) && !areaWords.has(w) && !/^\d+$/.test(w),
    );
  const namesOf = (names: readonly string[]): Names => ({
    keys: [...new Set(names.map(nameKey))],
    brands: [...new Set(names.flatMap((n) => brandOf(n) ?? []))],
  });
  const restaurants = new PlaceIndex();
  /** Restaurants with no location can only be matched by name, within their area (docs/07 §2). */
  const unlocatedByArea = new Map<string, string[]>();
  for (const r of input.restaurants) {
    const names = namesOf([r.name, ...r.aliases]);
    if (r.lat !== null && r.lng !== null) {
      restaurants.add({ lat: r.lat, lng: r.lng, ...names });
    } else if (r.areaId) {
      unlocatedByArea.set(r.areaId, [...(unlocatedByArea.get(r.areaId) ?? []), ...names.keys]);
    }
  }
  const reviewed = new PlaceIndex();
  for (const c of input.reviewed) {
    reviewed.add({ lat: c.lat, lng: c.lng, ...namesOf([c.name]) });
  }
  const picked = new PlaceIndex();
  const picks: AutoListPick[] = [];
  const held: AutoListHeld[] = [];
  const eligible: AutoListPick[] = [];

  for (const row of [...input.candidates].sort(byStrength)) {
    const cleanName = cleanPlaceName(row.name);
    const reason = holdReason(row, cleanName, input.release, areaKeys);
    if (reason) {
      held.push({ row, reason, cleanName });
      continue;
    }
    eligible.push({
      ...row,
      lat: row.lat!,
      lng: row.lng!,
      suggestedAreaId: row.suggestedAreaId!,
      cleanName: cleanName!,
      dishSlugs: autoListDishes(cleanName!, row.category),
    });
  }

  for (const row of eligible) {
    const names = namesOf([row.name, row.cleanName]);
    const isOurs =
      input.usedOvertureIds.has(row.overtureId) ||
      restaurants.matches(row, names) ||
      (unlocatedByArea.get(row.suggestedAreaId) ?? []).some((other) =>
        names.keys.some((key) => sameKeys(key, other)),
      );
    const reason: HoldReason | null = isOurs
      ? "DUPLICATE_OF_RESTAURANT"
      : reviewed.matches(row, names)
        ? "DUPLICATE_OF_REVIEWED"
        : picked.matches(row, names)
          ? "DUPLICATE"
          : null;
    if (reason) {
      held.push({ row, reason, cleanName: row.cleanName });
    } else {
      picked.add({ lat: row.lat, lng: row.lng, ...names });
      picks.push(row);
    }
  }
  return { picks, held };
}
