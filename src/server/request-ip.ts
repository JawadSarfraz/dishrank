import { createHmac } from "node:crypto";
import { env } from "@/env";

/**
 * The client IP. On Vercel the platform sets x-real-ip (and overwrites x-forwarded-for), so a
 * client cannot choose it. Anywhere else x-real-ip is whatever the client sent, so it is ignored
 * there (audit 2026-11, A-15) and the last x-forwarded-for hop, the one the nearest proxy saw, is
 * used instead.
 */
export function clientIp(headers: Headers, trustRealIp: boolean = Boolean(env.VERCEL)): string {
  const real = trustRealIp ? headers.get("x-real-ip")?.trim() : undefined;
  if (real) return real;
  const hops = headers.get("x-forwarded-for")?.split(",") ?? [];
  return hops.at(-1)?.trim() || "unknown";
}

let hashKey: Buffer | undefined;

/**
 * Keyed hash of an IP for rate-limit keys (never the raw IP), keyed by its own IP_HASH_SECRET
 * (owner, 2026-11-04; KICKOFF-REVIEW AP-12). A production server refuses to start without it
 * (src/env.ts); development and tests fall back to a fixed key.
 */
export function ipHash(ip: string): string {
  if (!hashKey) {
    const secret = env.IP_HASH_SECRET;
    if (!secret && env.NODE_ENV === "production") throw new Error("IP_HASH_SECRET is not set");
    hashKey = createHmac("sha256", secret ?? "dishrank-development-only")
      .update("dishrank/ip-hash/v2")
      .digest();
  }
  return createHmac("sha256", hashKey).update(ip).digest("hex").slice(0, 32);
}
