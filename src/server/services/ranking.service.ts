// RankingService (docs/04): rating weights, the Bayesian score, eligibility (bootstrap-aware), the
// per-row recompute that runs after every rating write, and the ranking page's list (getRanking).
// The nightly recomputeAll lives in ranking-nightly.service.ts.
import type { RestaurantDishStatus } from "@/generated/prisma/enums";
import { logEvent } from "@/server/log";
import {
  findCityLaunch,
  findDishStat,
  findRankInCity,
  findRestaurantDishList,
  findRestaurantStatus,
  listCountedRatings,
  listDishGroupsOfRestaurant,
  lockCityDish,
  lockCityDishLists,
  lockRestaurantDish,
  rerankCityDish,
  updateRestaurantDishAggregates,
} from "@/server/repositories/ranking.repo";
import { findCityBySlug, listRankingRows } from "@/server/repositories/public.repo";
import { findDishBySlug } from "@/server/repositories/taxonomy.repo";
import { inTransaction, type Tx } from "@/server/repositories/transaction";
import { haversineKm } from "@/lib/geo";
import { DAY_MS, RANKING, TRUST } from "./ranking.constants";

// ---------- math (pure) ----------

/** w = trust × 0.5^(age / 180 days): a 6-month-old rating counts half, a 1-year-old one a quarter. */
export function ratingWeight(trust: number, ageDays: number): number {
  return trust * 0.5 ** (Math.max(0, ageDays) / RANKING.halfLifeDays);
}

/** score = W/(W+m) × R + m/(W+m) × C: few votes pull toward the city prior, many toward R. */
export function bayesScore(
  weightSum: number,
  rawMean: number,
  prior: number,
  priorWeight: number = RANKING.priorWeight,
): number {
  return (
    (weightSum / (weightSum + priorWeight)) * rawMean +
    (priorWeight / (weightSum + priorWeight)) * prior
  );
}

/** C: the city-wide weighted mean for the dish, or 6.5 while it rests on fewer than 50 ratings. */
export function cityPrior(stat: { meanScore: number; ratingCount: number } | null): number {
  return stat && stat.ratingCount >= RANKING.priorMinRatings
    ? stat.meanScore
    : RANKING.priorFallback;
}

export type Thresholds = { mode: "bootstrap" | "normal"; minRaters: number; minWeight: number };

/** Bootstrap ("Early rankings") while the city is not launched and for 60 days after launch. */
export function thresholdsFor(launchedAt: Date | null, now: Date): Thresholds {
  const bootstrap =
    launchedAt === null || now.getTime() - launchedAt.getTime() < RANKING.bootstrapDays * DAY_MS;
  return bootstrap
    ? { mode: "bootstrap", ...RANKING.bootstrap }
    : { mode: "normal", ...RANKING.normal };
}

type RankableRow = {
  status: RestaurantDishStatus | string;
  distinctRaters: number;
  weightSum: number;
  score: number | null;
};

/** docs/04 eligibility; the ranking SQL (ranking.repo rerankCityDish) applies the same rule. */
export function isEligible(row: RankableRow, restaurantActive: boolean, t: Thresholds): boolean {
  return (
    restaurantActive &&
    row.score !== null &&
    (RANKING.eligibleStatuses as readonly string[]).includes(row.status) &&
    row.distinctRaters >= t.minRaters &&
    row.weightSum >= t.minWeight
  );
}

/**
 * Ratings still needed before the row can rank: the missing raters, or the missing weight counted in
 * fresh new-account ratings (trust 0.6 each), whichever is larger. 0 when nothing is missing.
 */
export function ratingsNeeded(
  row: Pick<RankableRow, "distinctRaters" | "weightSum">,
  t: Thresholds,
) {
  const raters = t.minRaters - row.distinctRaters;
  const weight = Math.ceil((t.minWeight - row.weightSum) / TRUST.newAccount - 1e-9);
  return Math.max(0, raters, weight);
}

export type TrustStats = {
  isPanel: boolean;
  activeRatings: number;
  activePhotoRatings: number;
  hiddenRatings: number;
  /** Upheld flags against the user's ratings. */
  upheldFlags: number;
  /** The user's latest ratings, newest first, any status (docs/04 abuse control 4). */
  recentRatings: readonly { score: number; restaurantId: string }[];
};

/**
 * docs/04 trust table, in this order: panel 1.3 (fixed) → ≥ 2 ratings hidden by an admin 0.3 →
 * the extreme-score pattern 0.6 → ≥ 20 active, no upheld flags, ≥ 30% with a photo 1.2 → ≥ 3
 * active and ≥ 1 with a photo 1.0 → 0.6.
 */
// DECISION-PENDING: docs/04 gives no order for overlapping rows; this one puts penalties first.
export function trustFor(s: TrustStats): number {
  if (s.isPanel) return TRUST.panel;
  if (s.hiddenRatings >= TRUST.penalised.minHidden) return TRUST.penalised.trust;
  if (isExtremePattern(s.recentRatings)) return TRUST.newAccount;
  const { trusted, established } = TRUST;
  if (
    s.activeRatings >= trusted.minActive &&
    s.upheldFlags === 0 &&
    s.activePhotoRatings / s.activeRatings >= trusted.minPhotoShare
  ) {
    return trusted.trust;
  }
  if (s.activeRatings >= established.minActive && s.activePhotoRatings >= established.minPhotos) {
    return established.trust;
  }
  return TRUST.newAccount;
}

/**
 * docs/04 abuse control 4: the user's last 10 ratings (newest first, any status) are all 10s or all
 * 1s, at more than one restaurant. Trust stays at the new-account value while this holds; there is
 * no review item yet.
 */
// DECISION-PENDING: "until reviewed" has no review flow yet, and "across different restaurants" is read as "more than one".
export function isExtremePattern(last: readonly { score: number; restaurantId: string }[]) {
  if (last.length < TRUST.extremeScores.lastRatings) return false;
  const recent = last.slice(0, TRUST.extremeScores.lastRatings);
  const extreme = recent.every((r) => r.score === 10) || recent.every((r) => r.score === 1);
  return extreme && new Set(recent.map((r) => r.restaurantId)).size > 1;
}

export type CountedRating = { userId: string; score: number; updatedAt: Date; trust: number };

/** The docs/04 sums over the counted (active, not banned) ratings of one dish row. */
export function aggregateRatings(ratings: readonly CountedRating[], now: Date) {
  let weightSum = 0;
  let weightedScoreSum = 0;
  let lastRatedAt: Date | null = null;
  for (const r of ratings) {
    const w = ratingWeight(r.trust, (now.getTime() - r.updatedAt.getTime()) / DAY_MS);
    weightSum += w;
    weightedScoreSum += w * r.score;
    if (!lastRatedAt || r.updatedAt > lastRatedAt) lastRatedAt = r.updatedAt;
  }
  return {
    ratingCount: ratings.length,
    // Ratings are unique per user per row, so the two counts agree; both columns stay for later.
    distinctRaters: new Set(ratings.map((r) => r.userId)).size,
    weightSum,
    weightedScoreSum,
    rawMean: weightSum > 0 ? weightedScoreSum / weightSum : null,
    lastRatedAt,
  };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

// ---------- recompute ----------

export type RecomputeResult = {
  restaurantDishId: string;
  status: string;
  score: number | null;
  rawMean: number | null;
  votes: number;
  weightSum: number;
  rankInCity: number | null;
  eligible: boolean;
  thresholds: Thresholds;
  ratingsNeeded: number;
  promoted: boolean;
};

/** Re-ranks one (city, dish) list with the given thresholds. Call with the list's lock held. */
export async function rerankList(cityId: string, dishId: string, t: Thresholds, tx: Tx) {
  await rerankCityDish(
    {
      cityId,
      dishId,
      statuses: RANKING.eligibleStatuses,
      minRaters: t.minRaters,
      minWeight: t.minWeight,
    },
    tx,
  );
}

/**
 * docs/04 recomputeOne: rebuilds one dish row from its counted ratings (decay at `now`), promotes
 * CANDIDATE → USER_CONFIRMED at 3 distinct raters, then re-ranks that (city, dish) list so rank
 * numbers are never stale. Runs after every rating write, delete and review decision, and for
 * every rated row in the nightly job (which re-ranks each list once afterwards instead).
 */
export async function recomputeOne(
  restaurantDishId: string,
  now: Date = new Date(),
  options: { rerank?: boolean } = {},
): Promise<RecomputeResult | null> {
  const started = Date.now();
  const result = await inTransaction(async (tx) => {
    // Lock order: the (city, dish) list first, then the row. A row's city and dish never change.
    const head = await findRestaurantDishList(restaurantDishId, tx);
    if (!head) return null;
    await lockCityDish(head.cityId, head.dishId, tx);
    const rd = await lockRestaurantDish(restaurantDishId, tx);
    if (!rd) return null;
    // One after another: a transaction is one connection, and pg refuses overlapping queries on it.
    const ratings = await listCountedRatings(rd.id, tx);
    const stat = await findDishStat(rd.cityId, rd.dishId, tx);
    const city = await findCityLaunch(rd.cityId, tx);
    const restaurant = await findRestaurantStatus(rd.restaurantId, tx);
    const agg = aggregateRatings(ratings, now);
    const score =
      agg.rawMean === null ? null : round3(bayesScore(agg.weightSum, agg.rawMean, cityPrior(stat)));
    const promoted = rd.status === "CANDIDATE" && agg.distinctRaters >= RANKING.promoteRaters;
    const updated = await updateRestaurantDishAggregates(
      rd.id,
      {
        ratingCount: agg.ratingCount,
        distinctRaters: agg.distinctRaters,
        weightSum: agg.weightSum,
        weightedScoreSum: agg.weightedScoreSum,
        rawMean: agg.rawMean === null ? null : round3(agg.rawMean),
        score,
        lastRatedAt: agg.lastRatedAt,
        ...(promoted ? { status: "USER_CONFIRMED", lastVerifiedAt: now } : {}),
      },
      tx,
    );
    const t = thresholdsFor(city?.launchedAt ?? null, now);
    // The nightly job re-ranks each list once after all its rows (rerank: false).
    if (options.rerank !== false) await rerankList(rd.cityId, rd.dishId, t, tx);
    const ranked = await findRankInCity(rd.id, tx);
    const row = {
      status: updated.status,
      distinctRaters: agg.distinctRaters,
      weightSum: agg.weightSum,
      score,
    };
    return {
      restaurantDishId: rd.id,
      status: updated.status,
      score,
      rawMean: agg.rawMean,
      votes: agg.distinctRaters,
      weightSum: agg.weightSum,
      rankInCity: ranked.rankInCity,
      eligible: ranked.rankInCity !== null,
      thresholds: t,
      ratingsNeeded: isEligible(row, restaurant?.status === "ACTIVE", t)
        ? 0
        : ratingsNeeded(row, t),
      promoted,
    } satisfies RecomputeResult;
  });
  if (result) {
    logEvent("ranking.recompute_one", {
      entityId: restaurantDishId,
      votes: result.votes,
      eligible: result.eligible,
      promoted: result.promoted,
      durationMs: Date.now() - started,
    });
  }
  return result;
}

async function rerankLists(
  lists: readonly { cityId: string; dishId: string }[],
  now: Date,
  tx: Tx,
) {
  // All locks first, in the global order, then the re-ranks.
  for (const g of await lockCityDishLists(lists, tx)) {
    const city = await findCityLaunch(g.cityId, tx);
    await rerankList(g.cityId, g.dishId, thresholdsFor(city?.launchedAt ?? null, now), tx);
  }
}

/**
 * recomputeOne for each row after a commit: a failure is logged and the other rows still run, so a
 * decision or write that already committed is never reported as failed. Returns the failed ids.
 */
export async function recomputeEach(rowIds: Iterable<string>, now: Date = new Date()) {
  const failed: string[] = [];
  for (const id of new Set(rowIds)) {
    try {
      await recomputeOne(id, now);
    } catch (error) {
      failed.push(id);
      logEvent(
        "ranking.recompute_failed",
        { entityId: id, error: error instanceof Error ? error.message : String(error) },
        "error",
      );
    }
  }
  return failed;
}

/** Re-ranks every (city, dish) list a restaurant appears in (after a status change or merge). */
export async function rerankRestaurant(restaurantId: string, now: Date = new Date()) {
  await inTransaction(async (tx) =>
    rerankLists(await listDishGroupsOfRestaurant(restaurantId, tx), now, tx),
  );
}

/** Re-ranks the given (city, dish) lists, e.g. after rows were deleted from them. */
export async function rerankCityDishes(
  lists: readonly { cityId: string; dishId: string }[],
  now: Date = new Date(),
) {
  await inTransaction(async (tx) => rerankLists(lists, now, tx));
}

// ---------- ranking page (docs/04 "Query for a ranking page", docs/06 GET /api/v1/rankings) ----------

export type RankingRestaurant = {
  slug: string;
  name: string;
  area: { slug: string; name: string } | null;
  priceBand: number | null;
  /** Our own coordinates (Overture, admin-typed or panel GPS); null when unknown. */
  lat: number | null;
  lng: number | null;
};

type RankingRowBase = {
  restaurantDishId: string;
  restaurant: RankingRestaurant;
  votes: number;
  price: number | null;
  variantTags: string[];
  status: RestaurantDishStatus;
  lastRatedAt: string | null;
  /** Only when the caller passed a location: km from it by our own coordinates. */
  distanceKm: number | null;
};

export type RankedRow = RankingRowBase & {
  /** City-wide rank (rankInCity): no filter or sort renumbers it. */
  rank: number;
  score: number;
  rawMean: number | null;
};

export type InsufficientRow = RankingRowBase & {
  /** More 0.6-trust raters it needs before it can rank. */
  ratingsNeeded: number;
};

export type Ranking = {
  city: { slug: string; name: string };
  dish: { id: string; slug: string; name: string };
  mode: Thresholds["mode"];
  thresholds: { minRaters: number; minWeight: number };
  eligible: RankedRow[];
  insufficient: InsufficientRow[];
  computedAt: string;
};

export type RankingOptions = {
  citySlug: string;
  dishSlug: string;
  /** GET /api/v1/rankings only: the page filters and sorts in the browser. */
  areaSlug?: string;
  sort?: "score" | "votes" | "price";
  lat?: number;
  lng?: number;
  radiusKm?: number;
  limit?: number;
};

const toNumber = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));

/**
 * One (city, dish) list: the ranked restaurants (rank = rankInCity, kept current by the re-rank)
 * and "Not enough votes yet" (ordered by votes, then the latest rating), with the mode and the
 * thresholds. Null when the city or dish does not exist. Ranks are always city-wide: area,
 * distance and sort only narrow or reorder (docs/04, Decided 2026-10-22).
 */
export async function getRanking(
  options: RankingOptions,
  now: Date = new Date(),
): Promise<Ranking | null> {
  const [city, dish] = await Promise.all([
    findCityBySlug(options.citySlug),
    findDishBySlug(options.dishSlug),
  ]);
  if (!city || !dish) return null;
  const t = thresholdsFor(city.launchedAt, now);
  const limit = options.limit ?? 100;
  const rows = await listRankingRows(city.id, dish.id, 400);
  const from = options.lat !== undefined && options.lng !== undefined ? options : null;

  const base = (r: (typeof rows)[number]): RankingRowBase => {
    const { lat, lng } = r.restaurant;
    return {
      restaurantDishId: r.id,
      restaurant: {
        slug: r.restaurant.slug,
        name: r.restaurant.name,
        area: r.restaurant.area,
        priceBand: r.restaurant.priceBand,
        lat,
        lng,
      },
      votes: r.distinctRaters,
      price: r.price,
      variantTags: r.variantTags,
      status: r.status,
      lastRatedAt: r.lastRatedAt?.toISOString() ?? null,
      distanceKm:
        from && lat !== null && lng !== null
          ? Math.round(haversineKm({ lat: from.lat!, lng: from.lng! }, { lat, lng }) * 10) / 10
          : null,
    };
  };
  const keep = (row: RankingRowBase) =>
    (!options.areaSlug || row.restaurant.area?.slug === options.areaSlug) &&
    (options.radiusKm === undefined ||
      (row.distanceKm !== null && row.distanceKm <= options.radiusKm));

  let eligible = rows
    .filter((r) => r.rankInCity !== null && r.score !== null)
    .map((r): RankedRow => ({
      ...base(r),
      rank: r.rankInCity!,
      score: toNumber(r.score)!,
      rawMean: toNumber(r.rawMean),
    }))
    .sort((a, b) => a.rank - b.rank)
    .filter(keep);
  if (options.sort === "votes")
    eligible = [...eligible].sort((a, b) => b.votes - a.votes || a.rank - b.rank);
  if (options.sort === "price") {
    eligible = [...eligible].sort(
      (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.rank - b.rank,
    );
  }

  const insufficient = rows
    .filter((r) => r.rankInCity === null)
    .map((r): InsufficientRow => ({
      ...base(r),
      ratingsNeeded: ratingsNeeded({ distinctRaters: r.distinctRaters, weightSum: r.weightSum }, t),
    }))
    .sort(
      (a, b) =>
        b.votes - a.votes ||
        (b.lastRatedAt ?? "").localeCompare(a.lastRatedAt ?? "") ||
        a.restaurant.name.localeCompare(b.restaurant.name),
    )
    .filter(keep);

  return {
    city: { slug: city.slug, name: city.name },
    dish: { id: dish.id, slug: dish.slug, name: dish.name },
    mode: t.mode,
    thresholds: { minRaters: t.minRaters, minWeight: t.minWeight },
    eligible: eligible.slice(0, limit),
    insufficient: insufficient.slice(0, limit),
    computedAt: now.toISOString(),
  };
}
