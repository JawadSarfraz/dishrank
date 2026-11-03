// The vision model's answer (docs/07 §3 schema) → MenuItem rows. Lenient on purpose: the answer is
// stored as rawJson first, and an item with a malformed price keeps its name with no price.

export const MENU_ITEMS = {
  /** A photo of one menu page; anything beyond this many items is dropped (and logged). */
  maxItems: 300,
  maxNameLength: 200,
  maxSectionLength: 120,
  /** PKR; a larger number is a misread, not a price. */
  maxPrice: 1_000_000,
} as const;

export type ParsedMenuItem = {
  /** As printed, in any script. */
  rawName: string;
  /** The model's Roman-Urdu spelling of a name that is not in Latin letters, else null. */
  romanName: string | null;
  rawPrice: number | null;
  rawSection: string | null;
};

/** Urdu (Extended Arabic-Indic) and Arabic-Indic digits → ASCII. */
function asciiDigits(text: string): string {
  return text.replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (d) =>
    String((d.charCodeAt(0) - 0x0660) % 0x90),
  );
}

/**
 * A printed PKR price as an integer: 1850, "1,850/-", "Rs. 1,850", "PKR 1850", "1850.00" → 1850.
 * Anything else (two prices in one, words, zero, negative, absurdly large) → null: never guessed.
 */
export function parsePrice(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    const text = asciiDigits(value)
      .toLowerCase()
      .replace(/\b(rs|pkr)\b\.?/g, "")
      .replace(/\/[-=]/g, "")
      .replace(/[\s,]/g, "")
      .replace(/\.(0+|-)$/, "");
    if (!/^\d+$/.test(text)) return null;
    n = Number(text);
  } else {
    return null;
  }
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > MENU_ITEMS.maxPrice) return null;
  return n;
}

const clean = (text: unknown, max: number): string =>
  typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, max) : "";

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** A letter of any script other than Latin (Urdu, Arabic, Devanagari…). */
const NON_LATIN_LETTER = /(?![A-Za-z\u00C0-\u024F])\p{L}/u;

/**
 * The text to match (docs/05): the printed name, or its Roman-Urdu spelling when the printed name
 * has letters outside the Latin script (Urdu "چکن کڑاہی" → "chicken karahi"). The matcher's
 * normalize() keeps Latin letters and digits only, so an Urdu name would otherwise match nothing.
 */
export function matchingName(item: { rawName: string; romanName: string | null }): string {
  return item.romanName && NON_LATIN_LETTER.test(item.rawName) ? item.romanName : item.rawName;
}

const field = (value: unknown, key: string): unknown =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;

/**
 * One row per printed item, in menu order, as the model gave them: sizes stay separate items
 * ("Chicken Karahi Half", "Chicken Karahi Full"), and the matcher strips the size words later
 * (docs/05). Items without a name are skipped; `dropped` counts items past the limit.
 */
export function toMenuItems(raw: unknown): { items: ParsedMenuItem[]; dropped: number } {
  const items: ParsedMenuItem[] = [];
  let dropped = 0;
  for (const section of list(field(raw, "sections"))) {
    const sectionName = clean(field(section, "name"), MENU_ITEMS.maxSectionLength) || null;
    for (const item of list(field(section, "items"))) {
      const rawName = clean(field(item, "name"), MENU_ITEMS.maxNameLength);
      if (!rawName) continue;
      if (items.length >= MENU_ITEMS.maxItems) {
        dropped++;
        continue;
      }
      items.push({
        rawName,
        romanName: clean(field(item, "roman"), MENU_ITEMS.maxNameLength).toLowerCase() || null,
        rawPrice: parsePrice(field(item, "price")),
        rawSection: sectionName,
      });
    }
  }
  return { items, dropped };
}
