// Every number of the ranking algorithm (docs/04-RANKING.md lists the same values).
import type { RestaurantDishStatus } from "@/generated/prisma/enums";

export const RANKING = {
  /** w = trust × 0.5^(ageDays / halfLifeDays) */
  halfLifeDays: 180,
  /** m: how many "votes" the city prior counts for in the Bayesian average. */
  priorWeight: 8,
  /** C when the city-dish mean rests on fewer than `priorMinRatings` ratings. */
  priorFallback: 6.5,
  priorMinRatings: 50,
  /** Eligibility after the city's launch period. */
  normal: { minRaters: 8, minWeight: 5.0 },
  /** Eligibility while City.launchedAt is NULL and for `bootstrapDays` after it ("Early rankings"). */
  bootstrap: { minRaters: 4, minWeight: 2.5 },
  bootstrapDays: 60,
  /** CANDIDATE → USER_CONFIRMED at this many distinct raters. */
  promoteRaters: 3,
  eligibleStatuses: [
    "USER_CONFIRMED",
    "MENU_VERIFIED",
    "OWNER_VERIFIED",
  ] as const satisfies readonly RestaurantDishStatus[],
  /**
   * Nightly step 4: a row with no rating or verification for this long becomes STALE. Age runs
   * from the latest of lastRatedAt, lastVerifiedAt and createdAt.
   */
  staleDays: { unverified: 270, verified: 365 },
  /** Nightly step 6: the top rows of each list, kept weekly (Sunday in Pakistan). */
  snapshotTop: 50,
} as const;

/** docs/04 trust table. */
export const TRUST = {
  newAccount: 0.6,
  /** ≥ 3 active ratings and ≥ 1 of them with a photo. */
  established: { trust: 1.0, minActive: 3, minPhotos: 1 },
  /** ≥ 20 active ratings, no upheld flags against them, ≥ 30% with a photo. */
  trusted: { trust: 1.2, minActive: 20, minPhotoShare: 0.3 },
  /** Panel members: fixed, the nightly job skips them. */
  panel: 1.3,
  /** ≥ 2 of the user's ratings hidden by an admin. */
  penalised: { trust: 0.3, minHidden: 2 },
  min: 0.3,
  max: 1.5,
  /**
   * docs/04 abuse control 4: when the user's last 10 ratings are all 10s or all 1s, across more
   * than one restaurant, trust is at most the new-account value while the pattern lasts.
   */
  extremeScores: { lastRatings: 10 },
} as const;

/** docs/04 abuse control 3. */
export const BURST = {
  /** ≥ this many ratings on one dish row… */
  ratings: 5,
  /** …within this many hours… */
  windowHours: 24,
  /** …from non-panel accounts younger than this many days → all of them HELD. */
  newAccountDays: 7,
} as const;

/** A dish a diner adds to a restaurant from the canonical list (docs/05, docs/07 table). */
export const USER_DISH = { source: "USER", confidence: 0.5 } as const;

export const DAY_MS = 86_400_000;
