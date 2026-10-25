// DB-backed sliding-window rate limits (docs/06 "Rate limits", ADR-9). A window is split into
// buckets of max(5 s, window / 12): 5 s buckets for a per-minute limit, 5 min for an hourly one.
import { AppError } from "@/server/errors";
import { incrementRateLimit } from "@/server/repositories/ops.repo";

export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  /** `ip:{hash}:search` (restaurant and dish search). */
  search: { limit: 120, windowSeconds: 60 },
  /** `ip:{hash}:api` (every public GET). */
  api: { limit: 600, windowSeconds: 3600 },
  /** `user:{id}:places-search` (every live Places search page on /admin/import is a billable call). */
  // DECISION-PENDING: 150 per day per admin keeps a month under the 5,000 free Text Search Pro calls.
  placesSearch: { limit: 150, windowSeconds: 86_400 },
  /** `user:{id}:admin-write` (every admin write: import, edit, status, merge). */
  // DECISION-PENDING: docs/06 has no admin key; 600 per hour leaves room for a long import session.
  adminWrite: { limit: 600, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export function bucketSeconds(windowSeconds: number): number {
  return Math.max(5, Math.floor(windowSeconds / 12));
}

/** Counts this request and throws AppError RATE_LIMITED (429) when the window is over its limit. */
export async function assertRateLimit(
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<void> {
  const size = bucketSeconds(rule.windowSeconds) * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / size) * size);
  const since = new Date(now.getTime() - rule.windowSeconds * 1000);
  const total = await incrementRateLimit(key, windowStart, since);
  if (total > rule.limit) {
    throw new AppError("RATE_LIMITED", "Too many requests. Try again in a little while.", 429);
  }
}
