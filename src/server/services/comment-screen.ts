// docs/04 abuse control 5: a comment with a phone number, a link or an email address (or a word on
// the blocklist) holds its rating for review. Pure; RatingService applies it.

/** Words that hold a comment for review. */
// DECISION-PENDING: docs/04 mentions a blocklist but defines no words; empty until the owner adds some.
export const COMMENT_BLOCKLIST: readonly string[] = [];

export type CommentFlag = "PHONE" | "LINK" | "EMAIL" | "BLOCKLIST";

/**
 * The text as a reader sees it: NFKC folds fullwidth digits and letters (０３００ → 0300), invisible
 * characters go (zero-width spaces and joiners, variation selectors, Hangul fillers: Unicode
 * "default ignorable"), every dash becomes "-", and Eastern Arabic and Persian digits (٠-٩, ۰-۹)
 * become ASCII digits.
 */
export function readable(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .replace(/[‐-―−﹘﹣]/g, "-")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** A number written with thousands separators ("3,200", "1,200,000") is money, never phone digits. */
const THOUSANDS = /(?<![\d,])\d{1,3}(?:,\d{3})+(?![\d,])/g;

const DAY = String.raw`(?:0?[1-9]|[12]\d|3[01])`;
const MONTH = String.raw`(?:0?[1-9]|1[0-2])`;
const YEAR = String.raw`(?:19|20)\d{2}`;
/**
 * Real dates (25/10/2026, 10/25/2026, 2026-10-25, 31.12.26) and clock times (19:30) are never phone
 * digits. Out-of-range parts are kept, so "0300-12-34-567" stays a phone number.
 */
const DATES_AND_TIMES = [
  new RegExp(String.raw`\b${DAY}[./-]${MONTH}[./-](?:${YEAR}|\d{2})\b`, "g"),
  new RegExp(String.raw`\b${MONTH}[./-]${DAY}[./-]${YEAR}\b`, "g"),
  new RegExp(String.raw`\b${YEAR}[./-]${MONTH}[./-]${DAY}\b`, "g"),
  /\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g,
];

/**
 * Digit groups joined by short runs of anything that is not a letter or digit ("0300 - 123 4567",
 * "0300/1234567", "0300·1234567"), with a leading + kept.
 */
const DIGIT_RUN = /\+?\d+(?:[^\p{L}\p{N}]{1,6}\d+)*/gu;

/** Spaces, dashes, dots and brackets: how people group a number. Anything else lists or sums. */
const SOFT_JOIN = /^[\s\-.()_]+$/u;

/**
 * Complete phone numbers, matched against the digits of whole groups only (so a list of prices
 * such as "3200 - 3500 - 3800" never reads as one): Pakistani mobiles (0300 1234567, 92 300
 * 1234567, 300 1234567), landlines with 0 or 92 and their area code (051 2345678, 92 42
 * 35678901), UAN numbers (111 222 333, 051 111 222 333) and toll-free or premium numbers (0800
 * 12345, 0900 12345).
 */
const PHONE_NUMBERS = [
  /^(?:0092|92|0)?3\d{9}$/,
  /^(?:0092|92|0)[1-9]\d{8,9}$/,
  /^(?:0[1-9]\d{1,3})?111\d{6}$/,
  /^0[89]00\d{5,6}$/,
];

function hasPhoneNumber(text: string): boolean {
  let rest = text.replace(THOUSANDS, " x "); // a letter: it also ends the digit run
  for (const pattern of DATES_AND_TIMES) rest = rest.replace(pattern, " ");
  for (const [run] of rest.matchAll(DIGIT_RUN)) {
    const groups = run.match(/\d+/g) ?? [];
    const joins = run.split(/\d+/).slice(1, -1); // the separator before each group after the first
    const digits = groups.join("");
    // "+44 20 7946 0958", "00971 50 123 4567": an international prefix and enough digits.
    if (/^(?:\+|00[1-9])/.test(run) && digits.length >= 9) return true;
    // Ten or more digits written together: a number, not a price or a score.
    if (groups.some((g) => g.length >= 10)) return true;
    for (let start = 0; start < groups.length; start++) {
      let candidate = "";
      let listed = false; // joined by list or sum punctuation (/ , + = |)
      let long = false; // has a group of 5 or more digits, as a subscriber number does
      for (let end = start; end < groups.length && candidate.length < 15; end++) {
        if (end > start && !SOFT_JOIN.test(joins[end - 1])) listed = true;
        if (groups[end].length >= 5) long = true;
        candidate += groups[end];
        // "350/700/1400" or "450 + 150" is a list of prices; "0300/1234567" or "0300/12/34/567"
        // is a number (prices never start with 0).
        if (listed && !long && !candidate.startsWith("0")) continue;
        if (PHONE_NUMBERS.some((number) => number.test(candidate))) return true;
      }
    }
  }
  return false;
}

/** An address with a lowercase (or all-capital) ending: "Visited@7pm.Food" is not one. */
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.(?:[a-z]{2,}|[A-Z]{2,})(?![\p{L}\p{N}])/u;

/**
 * A web address: a scheme or "www.", a domain with a path ("rb.gy/x", "t.me/abc"), or a bare domain
 * whose ending is a common one written in lowercase ("karahi.pk", "bit.ly"). Endings that are also
 * English words (in, to, be, me, us, top…) need a path, so "good.In short" or "karahi.to be honest"
 * is a missing space, not a link.
 */
const SCHEME_OR_WWW = /\bhttps?:\/\/|\bwww\./iu;
const DOMAIN_WITH_PATH = /(?<![\p{L}\p{N}-])[\p{L}\p{N}-]+\.[a-z]{2,}\/[\p{L}\p{N}]/u;
const BARE_DOMAIN = new RegExp(
  String.raw`(?<![\p{L}\p{N}-])[\p{L}\p{N}-]+\.(?:${[
    "com",
    "net",
    "org",
    "info",
    "biz",
    "pk",
    "io",
    "co",
    "ly",
    "gl",
    "gd",
    "gy",
    "cc",
    "ai",
    "app",
    "dev",
    "page",
    "link",
    "site",
    "online",
    "store",
    "shop",
    "xyz",
    "tk",
    "ml",
    "ga",
    "cf",
    "gq",
    "ws",
    "tv",
    "fm",
    "uk",
    "ae",
  ].join("|")})(?![\p{L}\p{N}])`,
  "u",
);

/** Why a comment is held for review, or null when it is fine. */
export function screenComment(comment: string | null | undefined): CommentFlag | null {
  if (!comment) return null;
  const text = readable(comment);
  if (hasPhoneNumber(text)) return "PHONE";
  if (EMAIL.test(text)) return "EMAIL";
  if (SCHEME_OR_WWW.test(text) || DOMAIN_WITH_PATH.test(text) || BARE_DOMAIN.test(text)) {
    return "LINK";
  }
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  if (COMMENT_BLOCKLIST.some((w) => words.includes(w.toLowerCase()))) return "BLOCKLIST";
  return null;
}
