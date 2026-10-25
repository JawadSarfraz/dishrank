import { createHmac } from "node:crypto";
import { env } from "@/env";

/**
 * The client IP. On Vercel the platform sets x-real-ip (and overwrites x-forwarded-for), so a
 * client cannot choose it; elsewhere the last x-forwarded-for hop is the one the nearest proxy saw.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = headers.get("x-forwarded-for")?.split(",") ?? [];
  return hops.at(-1)?.trim() || "unknown";
}

let hashKey: Buffer | undefined;

/**
 * Keyed hash of an IP for rate-limit keys (never the raw IP). The key is derived from
 * BETTER_AUTH_SECRET with a fixed label, so no extra secret is needed.
 */
// DECISION-PENDING: KICKOFF-REVIEW AP-12 proposes a separate IP_HASH_SECRET; derived key used for now.
export function ipHash(ip: string): string {
  if (!hashKey) {
    const secret = env.BETTER_AUTH_SECRET;
    if (!secret && env.NODE_ENV === "production") throw new Error("BETTER_AUTH_SECRET is not set");
    hashKey = createHmac("sha256", secret ?? "dishrank-development-only")
      .update("dishrank/ip-hash/v1")
      .digest();
  }
  return createHmac("sha256", hashKey).update(ip).digest("hex").slice(0, 32);
}
