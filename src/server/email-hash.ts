import { createHash } from "node:crypto";

/**
 * The one-way hash of an e-mail address for the ban list (BannedEmail, audit 2026-11 A-01): sha256
 * of the trimmed, lowercased address. Unkeyed on purpose, so the list survives every secret
 * rotation; it only ever answers "is this address on the list", and the addresses of every account
 * are in the User table in clear anyway.
 */
export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
