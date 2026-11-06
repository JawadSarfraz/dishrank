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
  /** `user:{id}:menu-upload`: menu photos sent for parsing (docs/07 §3). */
  // Decided 2026-11-04: docs/06 has no menu key; the owner's Phase 5 default, 10 a day.
  menuUpload: { limit: 10, windowSeconds: 86_400 },
  /** `user:{id}:claim`: owner claims (docs/07 §4, Phase 6). */
  // DECISION-PENDING: 3 a day; a real owner claims one or two restaurants.
  claim: { limit: 3, windowSeconds: 86_400 },
  /** `user:{id}:owner-write`: an owner's dish edits (Phase 6). */
  // DECISION-PENDING: 200 an hour, room for a whole menu in one sitting.
  ownerWrite: { limit: 200, windowSeconds: 3600 },
  /** `user:{id}:account-delete`: deleting one's own account (Phase 6). */
  accountDelete: { limit: 3, windowSeconds: 86_400 },
  /** `user:{id}:flag`: problem reports on restaurant pages (docs/06). */
  flag: { limit: 10, windowSeconds: 86_400 },
  /** `ip:{hash}:event`: what the browser reports: views, share clicks, sign-in steps (Phase 6). */
  // DECISION-PENDING: 300 an hour per IP: far above one person reading pages.
  event: { limit: 300, windowSeconds: 3600 },
  /** `ip:{hash}:health`: GET /api/health, an uptime monitor's check. */
  // DECISION-PENDING: 12 a minute per IP, one every 5 s; a monitor checks once a minute.
  health: { limit: 12, windowSeconds: 60 },
  /** `ip:{hash}:dispute`: the /dispute form, open to anyone. */
  // Decided 2026-11-04: docs/06 has no key for disputes; 5 a day per IP.
  dispute: { limit: 5, windowSeconds: 86_400 },
  /** `user:{id}:rating-delete`. */
  // Decided 2026-11-04: docs/06 has no key for deleting ratings; 30 a day.
  ratingDelete: { limit: 30, windowSeconds: 86_400 },
  /** `user:{id}:location`: panel members' on-site locations. */
  // Decided 2026-11-04: docs/06 has no key for location observations; 30 a day.
  location: { limit: 30, windowSeconds: 86_400 },
  /** `ip:{hash}:panel-invite`: starting a sign-in from a panel invite link. */
  // DECISION-PENDING: 30 an hour per IP; a shared office or mobile network can hold a few joiners.
  panelInvite: { limit: 30, windowSeconds: 3600 },
  /** `user:{id}:panel-join`: joining the panel through a link while signed in. */
  // DECISION-PENDING: 10 an hour; one tap is all it takes.
  panelJoin: { limit: 10, windowSeconds: 3600 },
  /** `user:{id}:admin-write` (every admin write: import, edit, status, merge, review, users). */
  // Decided 2026-11-04: docs/06 has no admin key; 600 per hour leaves room for a long import session.
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
