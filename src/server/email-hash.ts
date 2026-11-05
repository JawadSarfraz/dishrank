import { createHmac } from "node:crypto";
import { env } from "@/env";

let hashKey: Buffer | undefined;

/**
 * The one-way hash of an e-mail address for the ban list (BannedEmail, audit 2026-11 A-01): an HMAC
 * of the trimmed, lowercased address, so a copy of the table cannot be checked against a list of
 * addresses without the server's secret. The key comes from IP_HASH_SECRET with its own label (owner,
 * 2026-11-06: no new variable), like the IP hash. Changing that secret empties the ban list in effect
 * (docs/10). A production server refuses to start without it (src/env.ts); development and tests
 * fall back to a fixed key.
 */
export function emailHash(email: string): string {
  if (!hashKey) {
    const secret = env.IP_HASH_SECRET;
    if (!secret && env.NODE_ENV === "production") throw new Error("IP_HASH_SECRET is not set");
    hashKey = createHmac("sha256", secret ?? "dishrank-development-only")
      .update("dishrank/banned-email/v1")
      .digest();
  }
  return createHmac("sha256", hashKey).update(email.trim().toLowerCase()).digest("hex");
}
