// docs/04 abuse control 5: a comment with a phone number, a link or an email address (or a word on
// the blocklist) holds its rating for review. Pure; RatingService applies it.

/** Words that hold a comment for review. */
// DECISION-PENDING: docs/04 mentions a blocklist but defines no words; empty until the owner adds some.
export const COMMENT_BLOCKLIST: readonly string[] = [];

export type CommentFlag = "PHONE" | "LINK" | "EMAIL" | "BLOCKLIST";

/**
 * The text as a reader sees it: NFKC folds fullwidth digits and letters (０３００ → 0300), invisible
 * format characters (zero-width spaces and joiners) go, every dash becomes "-", and Eastern Arabic
 * and Persian digits (٠-٩, ۰-۹) become ASCII digits.
 */
export function readable(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/[‐-―−﹘﹣]/g, "-")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Digits with up to three separators between them, as people write numbers: "0300 - 123 4567". */
const DIGIT_RUN = /\+?\d(?:[\s().\/_-]{0,3}\d)*/g;

/**
 * How a phone number starts, read from the start of a digit group: Pakistani mobiles (0300 1234567,
 * 92 300 1234567, 300 1234567), landlines with an area code (051 2345678, 042 35678901), UAN and
 * toll-free numbers (111 222 333, 0800 12345), and international numbers with 00. Dates and prices
 * do not start this way ("25/10/2026 19:30", "Rs 1,850").
 */
const PHONE_STARTS = [
  /^(?:0092|92|0)?3\d{9}/,
  /^0[1-9]\d{8,9}/,
  /^(?:111|0800|0900)\d{6}/,
  /^00[1-9]\d{8,}/,
];

function hasPhoneNumber(text: string): boolean {
  for (const [run] of text.matchAll(DIGIT_RUN)) {
    const groups = run.split(/\D+/).filter(Boolean);
    const digits = groups.join("");
    // "+44 20 7946 0958": a plus sign and enough digits is a phone number anywhere.
    if (run.startsWith("+") && digits.length >= 9) return true;
    for (let i = 0; i < groups.length; i++) {
      const tail = groups.slice(i).join("");
      if (PHONE_STARTS.some((start) => start.test(tail))) return true;
    }
  }
  return false;
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u;

/** Top-level domains of links people share, short-link ones included (food words left out). */
const TLDS = [
  "com",
  "net",
  "org",
  "info",
  "biz",
  "pk",
  "io",
  "co",
  "me",
  "ly",
  "gl",
  "gd",
  "gy",
  "cc",
  "to",
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
  "live",
  "club",
  "top",
  "click",
  "tk",
  "ml",
  "ga",
  "cf",
  "gq",
  "ws",
  "tv",
  "fm",
  "be",
  "us",
  "uk",
  "ae",
  "in",
];
const LINK = new RegExp(
  [
    String.raw`\bhttps?:\/\/`,
    String.raw`\bwww\.`,
    // A bare domain such as "karahi.pk" or "bit.ly".
    String.raw`\b[\p{L}\p{N}-]+\.(?:${TLDS.join("|")})\b`,
    // Any domain with a path, whatever its ending: "rb.gy/x", "menu.example/abc".
    String.raw`\b[\p{L}\p{N}-]+\.[\p{L}]{2,}\/[\p{L}\p{N}]`,
  ].join("|"),
  "iu",
);

/** Why a comment is held for review, or null when it is fine. */
export function screenComment(comment: string | null | undefined): CommentFlag | null {
  if (!comment) return null;
  const text = readable(comment);
  if (hasPhoneNumber(text)) return "PHONE";
  if (EMAIL.test(text)) return "EMAIL";
  if (LINK.test(text)) return "LINK";
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  if (COMMENT_BLOCKLIST.some((w) => words.includes(w.toLowerCase()))) return "BLOCKLIST";
  return null;
}
