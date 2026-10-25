// RestaurantService (docs/07 §2, docs/05 restaurant search). Admin functions take the current user
// and check the role themselves (CLAUDE.md rule 6); inputs arrive already validated by Zod.
import type { Prisma, RestaurantStatus } from "@/generated/prisma/client";
import { slugify } from "@/lib/slug";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { findAreaById, findCityWithAreasBySlug } from "@/server/repositories/geo.repo";
import {
  findRestaurantByGooglePlaceId,
  findRestaurantById,
  findRestaurantBySlug,
  insertRestaurant,
  listRestaurantsPage,
  listSlugsStartingWith,
  lockRestaurants,
  lockSlugBase,
  searchRestaurantsByText,
  updateRestaurantById,
} from "@/server/repositories/restaurant.repo";
import {
  deleteRestaurantDish,
  findRestaurantDish,
  insertCandidateDish,
  listDishesOfRestaurant,
  lockDishesOfRestaurants,
  moveDishToRestaurant,
  updateDishPriceAndTags,
} from "@/server/repositories/restaurant-dish.repo";
import {
  addRatingHistory,
  deleteRating,
  listRatingsOfRestaurantDishes,
  moveRatingHistory,
  moveRatings,
} from "@/server/repositories/rating.repo";
import {
  deleteClaims,
  deleteFlags,
  listClaimsOfRestaurant,
  listFlagsOfRestaurantDishes,
  moveClaims,
  moveFlags,
  moveMenuUploads,
  moveOpenReviewItems,
} from "@/server/repositories/moderation.repo";
import { inTransaction, isUniqueViolation, type Tx } from "@/server/repositories/transaction";
import { assertRole, type SessionUser } from "@/server/roles";
import type {
  AdminRestaurantInput,
  AdminRestaurantListQuery,
  AdminRestaurantUpdateInput,
  RestaurantSearchQuery,
} from "@/server/validation";
import { cleanText } from "./matching/normalize";
import { checkFetchedAt } from "./places-policy";
import {
  planClaimMerge,
  planDishMerge,
  planFlagMerge,
  planOwnerMerge,
  planRatingMerge,
} from "./restaurant-merge";

// ---------- search text, aliases, slugs (pure) ----------

/** docs/05: the cleaned name and aliases (lowercase ASCII words) that pg_trgm searches. */
export function buildSearchText(name: string, aliases: readonly string[] = []): string {
  return [name, ...aliases].map(cleanText).filter(Boolean).join(" ");
}

/** Trimmed aliases without blanks, repeats or a copy of the name. */
export function normalizeAliases(aliases: readonly string[] | undefined, name: string): string[] {
  const seen = new Set([cleanText(name)]);
  const out: string[] = [];
  for (const alias of aliases ?? []) {
    const value = alias.trim();
    const key = cleanText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

const MAX_SLUG = 80;

/** "Butt Karahi" in F-7 → "butt-karahi-f-7"; the area is not repeated when the name already ends with it. */
export function restaurantSlugBase(name: string, areaSlug: string | null): string {
  const cut = (s: string, max: number) => s.slice(0, max).replace(/-+$/, "");
  const nameSlug = slugify(name) || "restaurant";
  if (!areaSlug || nameSlug === areaSlug || nameSlug.endsWith(`-${areaSlug}`)) {
    return cut(nameSlug, MAX_SLUG);
  }
  return `${cut(nameSlug, MAX_SLUG - areaSlug.length - 1)}-${areaSlug}`;
}

/** `base` if free, else the first free `base-2`, `base-3`, … (merged restaurants keep their slugs). */
export function pickUniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// ---------- create ----------

/** Import rows create or link this RestaurantDish (docs/07 table: Google seed = CANDIDATE, 0.4). */
export const IMPORT_DISH = { source: "GOOGLE_SEARCH", confidence: 0.4 } as const;

function conflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new AppError(
      "CONFLICT",
      "This changed at the same time elsewhere. Reload and try again.",
      409,
    );
  }
  throw error;
}

/** Inside a transaction: checks area and Google place, picks a unique slug, inserts. */
async function createRestaurantTx(input: AdminRestaurantInput, tx: Tx, now: Date) {
  const area = await findAreaById(input.areaId, tx);
  if (!area || area.cityId !== input.cityId) {
    throw new AppError("AREA_NOT_IN_CITY", "The area does not belong to this city", 400);
  }
  let googleSyncedAt: Date | null = null;
  if (input.googlePlaceId) {
    const fresh = checkFetchedAt(input.fetchedAt, now);
    if (!fresh.ok) throw new AppError("GOOGLE_DATA_TOO_OLD", fresh.reason, 400);
    googleSyncedAt = fresh.fetchedAt; // the time of the Google call, never the import time
    const other = await findRestaurantByGooglePlaceId(input.googlePlaceId, tx);
    if (other) {
      throw new AppError(
        "PLACE_ALREADY_LINKED",
        `This Google place is already linked to ${other.name}`,
        409,
        { restaurantId: other.id, slug: other.slug },
      );
    }
  }
  const aliases = normalizeAliases(input.aliases, input.name);
  const base = restaurantSlugBase(input.name, area.slug);
  await lockSlugBase(base, tx);
  const slug = pickUniqueSlug(base, new Set(await listSlugsStartingWith(base, tx)));
  return insertRestaurant(
    {
      slug,
      name: input.name,
      cityId: input.cityId,
      areaId: input.areaId,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      phone: input.phone ?? null,
      priceBand: input.priceBand ?? null,
      googlePlaceId: input.googlePlaceId ?? null,
      googleSyncedAt,
      aliases,
      searchText: buildSearchText(input.name, aliases),
    },
    tx,
  );
}

/**
 * The (restaurant, dish) row an import creates: CANDIDATE / GOOGLE_SEARCH / 0.4 when none exists.
 * An existing row of any status is left as it is.
 */
// DECISION-PENDING: docs/07 §2 "unless a stronger row exists" — an existing STALE or REMOVED row is not revived by an import.
export async function ensureImportedDish(
  restaurant: { id: string; cityId: string },
  dishId: string,
  tx: Tx,
) {
  const existing = await findRestaurantDish(restaurant.id, dishId, tx);
  if (existing) return { id: existing.id, status: existing.status, created: false };
  const created = await insertCandidateDish(
    { restaurantId: restaurant.id, dishId, cityId: restaurant.cityId, ...IMPORT_DISH },
    tx,
  );
  return { id: created.id, status: created.status, created: true };
}

/** POST /api/v1/admin/restaurants: create by hand or from an import row (`dishId` adds its CANDIDATE row). */
export async function createRestaurant(
  actor: SessionUser | null,
  input: AdminRestaurantInput,
  options: { dishId?: string; now?: Date } = {},
) {
  const admin = assertRole(actor, "ADMIN");
  const now = options.now ?? new Date();
  const started = Date.now();
  const result = await inTransaction(async (tx) => {
    const restaurant = await createRestaurantTx(input, tx, now);
    const restaurantDish = options.dishId
      ? await ensureImportedDish(restaurant, options.dishId, tx)
      : null;
    return { restaurant, restaurantDish };
  }).catch(conflict);
  logEvent("restaurant.create", {
    userId: admin.id,
    entityId: result.restaurant.id,
    googlePlaceId: input.googlePlaceId ?? null,
    restaurantDishId: result.restaurantDish?.id ?? null,
    durationMs: Date.now() - started,
  });
  return result;
}

// ---------- update, status ----------

async function loadEditable(id: string, tx?: Tx) {
  const restaurant = await findRestaurantById(id, tx);
  if (!restaurant) throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  if (restaurant.status === "DUPLICATE") {
    throw new AppError("RESTAURANT_MERGED", "This restaurant was merged into another one", 409, {
      mergedIntoId: restaurant.mergedIntoId,
    });
  }
  return restaurant;
}

/** Edit. The slug never changes (URLs stay stable); Google-linked coordinates are not typed. */
export async function updateRestaurant(
  actor: SessionUser | null,
  id: string,
  input: AdminRestaurantUpdateInput,
) {
  const admin = assertRole(actor, "ADMIN");
  const restaurant = await loadEditable(id);
  const area = await findAreaById(input.areaId);
  if (!area || area.cityId !== restaurant.cityId) {
    throw new AppError(
      "AREA_NOT_IN_CITY",
      "The area does not belong to this restaurant's city",
      400,
    );
  }
  const data: Prisma.RestaurantUncheckedUpdateInput = {};
  if (input.lat !== undefined || input.lng !== undefined) {
    if (restaurant.googlePlaceId) {
      throw new AppError(
        "COORDINATES_FROM_GOOGLE",
        "Coordinates of a Google-linked restaurant come from Google and its daily refresh",
        400,
      );
    }
    const hasLat = input.lat !== undefined && input.lat !== null;
    const hasLng = input.lng !== undefined && input.lng !== null;
    if (hasLat !== hasLng) throw new AppError("VALIDATION_FAILED", "lat and lng go together", 400);
    data.lat = input.lat ?? null;
    data.lng = input.lng ?? null;
  }
  const aliases = normalizeAliases(input.aliases, input.name);
  const updated = await updateRestaurantById(id, {
    ...data,
    name: input.name,
    areaId: input.areaId,
    address: input.address,
    phone: input.phone,
    priceBand: input.priceBand,
    aliases,
    searchText: buildSearchText(input.name, aliases),
  });
  logEvent("restaurant.update", { userId: admin.id, entityId: id });
  return { id, slug: updated.slug, citySlug: updated.city.slug };
}

export async function setRestaurantStatus(
  actor: SessionUser | null,
  id: string,
  status: Exclude<RestaurantStatus, "DUPLICATE">,
) {
  const admin = assertRole(actor, "ADMIN");
  const restaurant = await loadEditable(id);
  if (restaurant.status !== status) {
    await updateRestaurantById(id, { status });
    logEvent("restaurant.status", {
      userId: admin.id,
      entityId: id,
      from: restaurant.status,
      to: status,
    });
  }
  return { id, slug: restaurant.slug, citySlug: restaurant.city.slug, status };
}

// ---------- search and lookups ----------

export const RESTAURANT_SEARCH = { threshold: 0.3, limit: 8 } as const;

export type RestaurantSearchHit = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  address: string | null;
};

/** GET /api/v1/restaurants/search (docs/05): ACTIVE restaurants of the city, trigram ≥ 0.3 or ILIKE, top 8. */
export async function searchRestaurants(
  query: RestaurantSearchQuery,
): Promise<RestaurantSearchHit[]> {
  const city = await findCityWithAreasBySlug(query.city);
  if (!city) throw new AppError("CITY_NOT_FOUND", "Unknown city", 404);
  const text = cleanText(query.q);
  if (!text) return [];
  const rows = await searchRestaurantsByText({
    cityId: city.id,
    text,
    statuses: ["ACTIVE"],
    ...RESTAURANT_SEARCH,
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    area: r.areaName,
    address: r.address,
  }));
}

/** Link and merge targets for admins: every status except DUPLICATE. */
export async function searchRestaurantsForAdmin(
  actor: SessionUser | null,
  input: { cityId: string; q: string; excludeId?: string },
) {
  assertRole(actor, "ADMIN");
  const text = cleanText(input.q);
  if (!text) return [];
  return searchRestaurantsByText({
    cityId: input.cityId,
    text,
    statuses: ["ACTIVE", "CLOSED", "HIDDEN"],
    excludeId: input.excludeId,
    ...RESTAURANT_SEARCH,
  });
}

/** Merged restaurants point to their survivor; chains are followed this many hops at most. */
const MAX_MERGE_HOPS = 10;

export type PublicRestaurant = {
  id: string;
  slug: string;
  name: string;
  city: { slug: string; name: string };
  area: { slug: string; name: string } | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  priceBand: number | null;
};

export type PublicRestaurantDish = {
  dish: { slug: string; name: string };
  restaurantDishId: string;
  score: number | null;
  votes: number;
  rankInCity: number | null;
  status: string;
  price: number | null;
  variantTags: string[];
};

export type RestaurantLookup =
  | {
      kind: "found";
      restaurant: PublicRestaurant;
      dishes: PublicRestaurantDish[];
      claimed: boolean;
    }
  | { kind: "redirect"; slug: string; citySlug: string }
  | { kind: "not_found" };

/**
 * GET /api/v1/restaurants/:slug and the restaurant page. A merged slug resolves to its surviving
 * restaurant (redirect); only ACTIVE restaurants are shown.
 */
// DECISION-PENDING: CLOSED and HIDDEN restaurants answer 404 publicly (docs say nothing about closed pages).
export async function getPublicRestaurant(slug: string): Promise<RestaurantLookup> {
  let restaurant = await findRestaurantBySlug(slug);
  for (let hops = 0; restaurant?.status === "DUPLICATE" && restaurant.mergedIntoId; hops++) {
    if (hops >= MAX_MERGE_HOPS) return { kind: "not_found" };
    restaurant = await findRestaurantById(restaurant.mergedIntoId);
  }
  if (!restaurant || restaurant.status !== "ACTIVE") return { kind: "not_found" };
  if (restaurant.slug !== slug) {
    return { kind: "redirect", slug: restaurant.slug, citySlug: restaurant.city.slug };
  }

  const rows = await listDishesOfRestaurant(restaurant.id);
  const dishes = rows
    .filter((rd) => rd.status !== "REMOVED")
    .map((rd): PublicRestaurantDish => ({
      dish: rd.dish,
      restaurantDishId: rd.id,
      score: rd.score === null ? null : Number(rd.score),
      votes: rd.distinctRaters,
      rankInCity: rd.rankInCity,
      status: rd.status,
      price: rd.price,
      variantTags: rd.variantTags,
    }))
    // docs/06: eligible (ranked) rows by score, then the others by votes.
    .sort((a, b) => {
      const ranked = Number(b.rankInCity !== null) - Number(a.rankInCity !== null);
      if (ranked !== 0) return ranked;
      if (a.rankInCity !== null) return (b.score ?? 0) - (a.score ?? 0);
      return b.votes - a.votes || a.dish.name.localeCompare(b.dish.name);
    });

  return {
    kind: "found",
    restaurant: {
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      city: { slug: restaurant.city.slug, name: restaurant.city.name },
      area: restaurant.area ? { slug: restaurant.area.slug, name: restaurant.area.name } : null,
      address: restaurant.address,
      lat: restaurant.lat,
      lng: restaurant.lng,
      phone: restaurant.phone,
      priceBand: restaurant.priceBand,
    },
    dishes,
    claimed: Boolean(restaurant.claimedByUserId),
  };
}

export const ADMIN_PAGE_SIZE = 25;

export async function listRestaurantsForAdmin(
  actor: SessionUser | null,
  query: AdminRestaurantListQuery,
) {
  assertRole(actor, "ADMIN");
  const city = query.city ? await findCityWithAreasBySlug(query.city) : null;
  const { items, total } = await listRestaurantsPage({
    cityId: city?.id,
    status: query.status,
    text: query.q ? cleanText(query.q) || undefined : undefined,
    skip: (query.page - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
  });
  return {
    items,
    total,
    page: query.page,
    pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
  };
}

export async function getRestaurantForAdmin(actor: SessionUser | null, id: string) {
  assertRole(actor, "ADMIN");
  const restaurant = await findRestaurantById(id);
  if (!restaurant) return null;
  const [city, dishes, mergedInto] = await Promise.all([
    findCityWithAreasBySlug(restaurant.city.slug),
    listDishesOfRestaurant(restaurant.id),
    restaurant.mergedIntoId ? findRestaurantById(restaurant.mergedIntoId) : null,
  ]);
  return {
    restaurant,
    areas: city?.areas ?? [],
    dishes,
    mergedInto: mergedInto
      ? { id: mergedInto.id, slug: mergedInto.slug, name: mergedInto.name }
      : null,
  };
}

// ---------- merge (docs/07 §2) ----------

export type MergeResult = {
  source: { id: string; slug: string; citySlug: string };
  target: { id: string; slug: string; citySlug: string };
  movedDishes: string[];
  mergedDishes: { dishId: string; keptId: string; droppedId: string }[];
  movedRatings: string[];
  mergedRatings: { keptId: string; droppedId: string }[];
  movedFlags: string[];
  droppedFlags: string[];
  movedClaims: string[];
  droppedClaims: string[];
  movedMenuUploads: number;
  movedReviewItems: number;
  googlePlaceMoved: boolean;
  ownerMoved: boolean;
  /** Kept rows whose ratings changed: recomputeOne runs on them after commit. */
  recomputeIds: string[];
  /** Dishes of the source, whose ranking pages change. */
  dishSlugs: string[];
};

/**
 * Step 7 hook. RankingService.recomputeOne arrives in Phase 3 (no ratings exist before it).
 */
// DECISION-PENDING: until Phase 3 the merge only logs the rows to recompute; Phase 3 wires recomputeOne here.
export async function recomputeAfterMerge(restaurantDishIds: readonly string[]): Promise<void> {
  if (restaurantDishIds.length > 0) {
    logEvent("restaurant.merge.recompute_pending", { restaurantDishIds }, "warn");
  }
}

/** Merges `sourceId` into `targetId` in one transaction; the source becomes DUPLICATE. */
export async function mergeRestaurants(
  actor: SessionUser | null,
  sourceId: string,
  targetId: string,
  afterCommit: (recomputeIds: readonly string[]) => Promise<void> = recomputeAfterMerge,
): Promise<MergeResult> {
  const admin = assertRole(actor, "ADMIN");
  if (sourceId === targetId) {
    throw new AppError("MERGE_SAME_RESTAURANT", "A restaurant cannot be merged into itself", 400);
  }
  const started = Date.now();

  const result = await inTransaction(async (tx): Promise<MergeResult> => {
    await lockRestaurants([sourceId, targetId], tx);
    const source = await findRestaurantById(sourceId, tx);
    const target = await findRestaurantById(targetId, tx);
    if (!source || !target) throw new AppError("NOT_FOUND", "Restaurant not found", 404);
    if (source.status === "DUPLICATE" || target.status === "DUPLICATE") {
      throw new AppError("RESTAURANT_MERGED", "One of these restaurants was already merged", 409);
    }
    // DECISION-PENDING: merging across cities is refused (RestaurantDish.cityId must equal the restaurant's city).
    if (source.cityId !== target.cityId) {
      throw new AppError(
        "MERGE_CITY_MISMATCH",
        "Only restaurants of the same city can be merged",
        409,
      );
    }
    const owner = planOwnerMerge(source.claimedByUserId, target.claimedByUserId);
    if (owner.conflict) {
      throw new AppError(
        "MERGE_CONFLICTING_OWNERS",
        "Both restaurants are claimed by different owners",
        409,
      );
    }

    // Steps 1-3: dishes, ratings, flags.
    await lockDishesOfRestaurants([sourceId, targetId], tx);
    const sourceDishes = await listDishesOfRestaurant(sourceId, tx);
    const plan = planDishMerge(sourceDishes, await listDishesOfRestaurant(targetId, tx));
    const out: MergeResult = {
      source: { id: source.id, slug: source.slug, citySlug: source.city.slug },
      target: { id: target.id, slug: target.slug, citySlug: target.city.slug },
      movedDishes: [],
      mergedDishes: [],
      movedRatings: [],
      mergedRatings: [],
      movedFlags: [],
      droppedFlags: [],
      movedClaims: [],
      droppedClaims: [],
      movedMenuUploads: 0,
      movedReviewItems: 0,
      googlePlaceMoved: false,
      ownerMoved: owner.moveToTarget,
      recomputeIds: [],
      dishSlugs: sourceDishes.map((rd) => rd.dish.slug),
    };

    for (const rd of plan.move) {
      await moveDishToRestaurant(rd.id, targetId, tx); // its ratings and flags come along
      out.movedDishes.push(rd.id);
    }

    for (const pair of plan.pairs) {
      const ratings = await listRatingsOfRestaurantDishes([pair.keep.id, pair.drop.id], tx);
      const ratingPlan = planRatingMerge(
        ratings.filter((r) => r.restaurantDishId === pair.keep.id),
        ratings.filter((r) => r.restaurantDishId === pair.drop.id),
      );
      for (const { kept, older } of ratingPlan.collisions) {
        await addRatingHistory(
          {
            ratingId: kept.id,
            score: older.score,
            comment: older.comment,
            createdAt: older.createdAt,
          },
          tx,
        );
        await moveRatingHistory(older.id, kept.id, tx);
        await deleteRating(older.id, tx);
        out.mergedRatings.push({ keptId: kept.id, droppedId: older.id });
      }
      await moveRatings(
        ratingPlan.move.map((r) => r.id),
        pair.keep.id,
        tx,
      );
      out.movedRatings.push(...ratingPlan.move.map((r) => r.id));

      const flags = await listFlagsOfRestaurantDishes([pair.keep.id, pair.drop.id], tx);
      const flagPlan = planFlagMerge(
        flags.filter((f) => f.restaurantDishId === pair.keep.id),
        flags.filter((f) => f.restaurantDishId === pair.drop.id),
      );
      await deleteFlags(flagPlan.drop, tx);
      await moveFlags(flagPlan.move, pair.keep.id, tx);
      out.droppedFlags.push(...flagPlan.drop);
      out.movedFlags.push(...flagPlan.move);

      await deleteRestaurantDish(pair.drop.id, tx);
      if (pair.keepFromSource) await moveDishToRestaurant(pair.keep.id, targetId, tx);
      await updateDishPriceAndTags(
        pair.keep.id,
        { price: pair.price, variantTags: pair.variantTags },
        tx,
      );
      out.mergedDishes.push({ dishId: pair.dishId, keptId: pair.keep.id, droppedId: pair.drop.id });
      if (ratingPlan.move.length > 0 || ratingPlan.collisions.length > 0) {
        out.recomputeIds.push(pair.keep.id);
      }
    }

    // Step 4: menu uploads, owner claims, open review items.
    out.movedMenuUploads = (await moveMenuUploads(sourceId, targetId, tx)).count;
    const claimPlan = planClaimMerge(
      await listClaimsOfRestaurant(targetId, tx),
      await listClaimsOfRestaurant(sourceId, tx),
    );
    await deleteClaims(claimPlan.drop, tx);
    await moveClaims(claimPlan.move, targetId, tx);
    out.droppedClaims = claimPlan.drop;
    out.movedClaims = claimPlan.move;
    out.movedReviewItems = (await moveOpenReviewItems(sourceId, targetId, tx)).count;

    // Steps 5-6: Google place (the unique column is cleared on the source first), owner, status.
    const sourceUpdate: Prisma.RestaurantUncheckedUpdateInput = {
      status: "DUPLICATE",
      mergedIntoId: targetId,
      claimedByUserId: null,
      claimedAt: null,
    };
    const targetUpdate: Prisma.RestaurantUncheckedUpdateInput = {};
    if (owner.moveToTarget) {
      targetUpdate.claimedByUserId = source.claimedByUserId;
      targetUpdate.claimedAt = source.claimedAt;
    }
    if (source.googlePlaceId) {
      // The source keeps no Google data: its place id and coordinates go to the target or away.
      Object.assign(sourceUpdate, {
        googlePlaceId: null,
        lat: null,
        lng: null,
        googleSyncedAt: null,
      });
      if (!target.googlePlaceId) {
        Object.assign(targetUpdate, {
          googlePlaceId: source.googlePlaceId,
          lat: source.lat,
          lng: source.lng,
          googleSyncedAt: source.googleSyncedAt,
        });
        out.googlePlaceMoved = true;
      }
    }
    await updateRestaurantById(sourceId, sourceUpdate, tx);
    if (Object.keys(targetUpdate).length > 0)
      await updateRestaurantById(targetId, targetUpdate, tx);
    return out;
  }, 60_000).catch(conflict);

  await afterCommit(result.recomputeIds);
  logEvent("restaurant.merge", {
    userId: admin.id,
    sourceId,
    targetId,
    movedDishes: result.movedDishes,
    mergedDishes: result.mergedDishes,
    movedRatings: result.movedRatings,
    mergedRatings: result.mergedRatings,
    movedFlags: result.movedFlags,
    droppedFlags: result.droppedFlags,
    movedClaims: result.movedClaims,
    droppedClaims: result.droppedClaims,
    movedMenuUploads: result.movedMenuUploads,
    movedReviewItems: result.movedReviewItems,
    googlePlaceMoved: result.googlePlaceMoved,
    ownerMoved: result.ownerMoved,
    durationMs: Date.now() - started,
  });
  return result;
}
