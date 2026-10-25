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
  /** `user:{id}:rating`: rating submissions (new or replaced) per user (docs/04 abuse control 2). */
  rating: { limit: 15, windowSeconds: 86_400 },
  ratingPanel: { limit: 30, windowSeconds: 86_400 },
  /** `user:{id}:rating:restaurant:{rid}`: rating submissions per user at one restaurant. */
  ratingRestaurant: { limit: 3, windowSeconds: 86_400 },
  ratingRestaurantPanel: { limit: 10, windowSeconds: 86_400 },
  /** `user:{id}:add-dish`: dish rows a diner adds to restaurants (by rating or directly). */
  addDish: { limit: 10, windowSeconds: 86_400 },
  /** `user:{id}:proposal`: dish and restaurant suggestions. */
  proposal: { limit: 5, windowSeconds: 86_400 },
  /** `user:{id}:upload`: signed photo uploads. */
  upload: { limit: 20, windowSeconds: 86_400 },
  /** `user:{id}:rating-delete`. */
  // DECISION-PENDING: docs/06 has no key for deleting ratings; 30 a day.
  ratingDelete: { limit: 30, windowSeconds: 86_400 },
  /** `user:{id}:location`: panel members' on-site locations. */
  // DECISION-PENDING: docs/06 has no key for location observations; 30 a day.
  location: { limit: 30, windowSeconds: 86_400 },
  /** `user:{id}:admin-write` (every admin write: import, edit, status, merge, review, users). */
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
