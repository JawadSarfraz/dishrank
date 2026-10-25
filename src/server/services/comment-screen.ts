// docs/04 abuse control 5: a comment with a phone number, a link or an email address (or a word on
// the blocklist) holds its rating for review. Pure; RatingService applies it.

/** Words that hold a comment for review. */
// DECISION-PENDING: docs/04 mentions a blocklist but defines no words; empty until the owner adds some.
export const COMMENT_BLOCKLIST: readonly string[] = [];

export type CommentFlag = "PHONE" | "LINK" | "EMAIL" | "BLOCKLIST";

/** Eastern Arabic and Persian digits (٠-٩, ۰-۹) count as digits too. */
function asciiDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * 9 or more digits in a row, allowing spaces, dots, dashes and brackets between them: Pakistani
 * numbers have 10 or 11 digits with the area code, while dates and prices stay below 9.
 */
const PHONE = /(?:\+?\d[\s().-]{0,2}){8,}\d/;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const LINK = new RegExp(
  [
    String.raw`\bhttps?:\/\/`,
    String.raw`\bwww\.`,
    // A bare domain such as "karahi.pk" or "bit.ly/x".
    String.raw`\b[a-z0-9-]+\.(?:com|pk|net|org|io|co|me|ly|app|shop|store|info|biz|xyz|online|site|link|gl|page)\b`,
  ].join("|"),
  "i",
);

/** Why a comment is held for review, or null when it is fine. */
export function screenComment(comment: string | null | undefined): CommentFlag | null {
  if (!comment) return null;
  const text = asciiDigits(comment);
  if (PHONE.test(text)) return "PHONE";
  if (EMAIL.test(text)) return "EMAIL";
  if (LINK.test(text)) return "LINK";
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  if (COMMENT_BLOCKLIST.some((w) => words.includes(w.toLowerCase()))) return "BLOCKLIST";
  return null;
}
