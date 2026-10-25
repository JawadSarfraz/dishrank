// RestaurantService (docs/07 §2, docs/05 restaurant search). Admin functions take the current user
// and check the role themselves (CLAUDE.md rule 6); inputs arrive already validated by Zod.
import type {
  LocationSource,
  Prisma,
  RestaurantSource,
  RestaurantStatus,
} from "@/generated/prisma/client";
import { slugify } from "@/lib/slug";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { findAreaById, findCityWithAreasBySlug } from "@/server/repositories/geo.repo";
import {
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
  closeReviewItem,
  deleteClaims,
  deleteFlags,
  listClaimsOfRestaurant,
  listFlagsOfRestaurantDishes,
  listSuspiciousItemsOfRow,
  moveClaims,
  moveFlags,
  moveLocationObservations,
  moveMenuUploads,
  moveOpenReviewItems,
  updateReviewItemPayload,
} from "@/server/repositories/moderation.repo";
import { listDishGroupsOfRestaurant, lockCityDishLists } from "@/server/repositories/ranking.repo";
import { adjustRatingCounters } from "@/server/repositories/user.repo";
import { moveCandidatesToRestaurant } from "@/server/repositories/overture.repo";
import { findDishesBySlugs } from "@/server/repositories/taxonomy.repo";
import { inTransaction, type Tx } from "@/server/repositories/transaction";
import { assertRole, type SessionUser } from "@/server/roles";
import type {
  AdminRestaurantInput,
  AdminRestaurantListQuery,
  AdminRestaurantUpdateInput,
  RestaurantSearchQuery,
} from "@/server/validation";
import { rethrowConflict } from "./conflict";
import { recomputeOne, rerankRestaurant } from "./ranking.service";
import { cleanText } from "./matching/normalize";
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

/** Dishes an admin ticks for a restaurant become this RestaurantDish (docs/07: CANDIDATE, 0.4). */
export const ADMIN_DISH = { source: "ADMIN", confidence: 0.4 } as const;

/** A restaurant as an admin confirmed it, with where the record and its location came from. */
export type NewRestaurant = {
  name: string;
  areaId: string;
  address: string;
  phone?: string | null;
  website?: string | null;
  priceBand?: number | null;
  aliases?: string[];
  source: RestaurantSource;
  overtureId?: string | null;
  location: { lat: number; lng: number; source: LocationSource } | null;
};

/** Inside a transaction: checks the area, picks a unique slug, inserts. The city is the area's. */
export async function insertRestaurantTx(input: NewRestaurant, tx: Tx) {
  const area = await findAreaById(input.areaId, tx);
  if (!area) throw new AppError("AREA_NOT_FOUND", "Unknown area", 400);
  const aliases = normalizeAliases(input.aliases, input.name);
  const base = restaurantSlugBase(input.name, area.slug);
  await lockSlugBase(base, tx);
  const slug = pickUniqueSlug(base, new Set(await listSlugsStartingWith(base, tx)));
  return insertRestaurant(
    {
      slug,
      name: input.name,
      cityId: area.cityId,
      areaId: area.id,
      address: input.address,
      lat: input.location?.lat ?? null,
      lng: input.location?.lng ?? null,
      locationSource: input.location?.source ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      priceBand: input.priceBand ?? null,
      source: input.source,
      overtureId: input.overtureId ?? null,
      aliases,
      searchText: buildSearchText(input.name, aliases),
    },
    tx,
  );
}

/** Dish ids for ticked slugs; an unknown slug is refused. */
export async function resolveDishSlugs(slugs: readonly string[] | undefined): Promise<string[]> {
  const wanted = [...new Set(slugs ?? [])];
  if (wanted.length === 0) return [];
  const dishes = await findDishesBySlugs(wanted);
  const missing = wanted.filter((slug) => !dishes.some((d) => d.slug === slug));
  if (missing.length > 0) {
    throw new AppError("DISH_NOT_FOUND", `Unknown dish: ${missing.join(", ")}`, 400);
  }
  return dishes.map((d) => d.id);
}

/**
 * The (restaurant, dish) row for a dish an admin ticked: CANDIDATE / ADMIN / 0.4 when none exists.
 * An existing row of any status is left as it is.
 */
// DECISION-PENDING: docs/07 §2 "unless a stronger row exists" — an existing STALE or REMOVED row is not revived by an admin tick.
export async function ensureAdminDish(
  restaurant: { id: string; cityId: string },
  dishId: string,
  tx: Tx,
) {
  const existing = await findRestaurantDish(restaurant.id, dishId, tx);
  if (existing) return { id: existing.id, status: existing.status, created: false };
  const created = await insertCandidateDish(
    { restaurantId: restaurant.id, dishId, cityId: restaurant.cityId, ...ADMIN_DISH },
    tx,
  );
  return { id: created.id, status: created.status, created: true };
}

/** Adds a CANDIDATE row for each ticked dish (rows that exist are left as they are). */
export async function addAdminDishesTx(
  restaurant: { id: string; cityId: string },
  dishIds: readonly string[],
  tx: Tx,
) {
  const rows = [];
  for (const dishId of dishIds) rows.push(await ensureAdminDish(restaurant, dishId, tx));
  return rows;
}

/**
 * POST /api/v1/admin/restaurants and /admin/restaurants/new: a restaurant added by hand (source
 * MANUAL) for a place Overture misses; the location is optional and counts as typed by an admin.
 */
export async function createRestaurant(actor: SessionUser | null, input: AdminRestaurantInput) {
  const admin = assertRole(actor, "ADMIN");
  const started = Date.now();
  const dishIds = await resolveDishSlugs(input.dishSlugs);
  const result = await inTransaction(async (tx) => {
    const restaurant = await insertRestaurantTx(
      {
        name: input.name,
        areaId: input.areaId,
        address: input.address,
        phone: input.phone,
        website: input.website,
        priceBand: input.priceBand,
        aliases: input.aliases,
        source: "MANUAL",
        location:
          input.lat !== undefined && input.lng !== undefined
            ? { lat: input.lat, lng: input.lng, source: "ADMIN" }
            : null,
      },
      tx,
    );
    const dishes = await addAdminDishesTx(restaurant, dishIds, tx);
    return { restaurant, dishes };
  }).catch(rethrowConflict);
  logEvent("restaurant.create", {
    userId: admin.id,
    entityId: result.restaurant.id,
    source: "MANUAL",
    restaurantDishIds: result.dishes.map((d) => d.id),
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

/** Edit. The slug never changes (URLs stay stable). */
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
    const lat = input.lat ?? null;
    const lng = input.lng ?? null;
    if ((lat === null) !== (lng === null)) {
      throw new AppError("VALIDATION_FAILED", "lat and lng go together", 400);
    }
    // Unchanged coordinates keep their source; typed ones are the admin's; none means unknown.
    if (lat !== restaurant.lat || lng !== restaurant.lng) {
      Object.assign(data, { lat, lng, locationSource: lat === null ? null : "ADMIN" });
    }
  }
  const aliases = normalizeAliases(input.aliases, input.name);
  const updated = await updateRestaurantById(id, {
    ...data,
    name: input.name,
    areaId: input.areaId,
    address: input.address,
    phone: input.phone,
    website: input.website,
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
    // Only ACTIVE restaurants rank (docs/04): its dish rows gain or lose their rank numbers now.
    await rerankRestaurant(id);
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

/**
 * The public view of a restaurant. lat/lng are our own (from Overture or typed by an admin) and
 * drive the Phase 4 distance features; null = location unknown.
 */
export type PublicRestaurant = {
  id: string;
  slug: string;
  name: string;
  city: { slug: string; name: string };
  area: { slug: string; name: string } | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  priceBand: number | null;
  lat: number | null;
  lng: number | null;
};

export type PublicRestaurantDish = {
  dish: { id: string; slug: string; name: string };
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
      phone: restaurant.phone,
      website: restaurant.website,
      priceBand: restaurant.priceBand,
      lat: restaurant.lat,
      lng: restaurant.lng,
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
  /** Held-rating review items of dropped rows, now on the kept row (or merged into its item). */
  movedHeldRatingItems: number;
  movedCandidates: number;
  movedLocationObservations: number;
  ownerMoved: boolean;
  overtureIdMoved: boolean;
  locationMoved: boolean;
  /** Kept rows whose ratings changed: recomputeOne runs on them after commit. */
  recomputeIds: string[];
  /** Dishes of the source, whose ranking pages change. */
  dishSlugs: string[];
};

/** Step 7: recompute the kept rows whose ratings changed (each recompute re-ranks its list). */
export async function recomputeAfterMerge(restaurantDishIds: readonly string[]): Promise<void> {
  for (const id of restaurantDishIds) await recomputeOne(id);
}

type HeldItemPayload = {
  restaurantDishId: string;
  ratingIds?: string[];
  flags?: string[];
  reason: string;
};

/**
 * Held-rating items (SUSPICIOUS_RATINGS) follow their ratings from a dropped dish row to the kept
 * one, so "already released" and "listed in another open item" keep working there (docs/07 §6).
 * An open item joins the kept row's open item of the same reason; every other item, closed ones
 * included, just points at the kept row.
 */
async function moveHeldRatingItems(fromRowId: string, toRowId: string, adminId: string, tx: Tx) {
  const openOnKept = new Map<string, { id: string; payload: HeldItemPayload }>();
  for (const item of await listSuspiciousItemsOfRow(toRowId, tx)) {
    const payload = item.payload as HeldItemPayload;
    if (item.status === "OPEN") openOnKept.set(payload.reason, { id: item.id, payload });
  }
  const items = await listSuspiciousItemsOfRow(fromRowId, tx);
  for (const item of items) {
    const payload = { ...(item.payload as HeldItemPayload), restaurantDishId: toRowId };
    const into = item.status === "OPEN" ? openOnKept.get(payload.reason) : undefined;
    if (!into) {
      await updateReviewItemPayload(item.id, payload, tx);
      continue;
    }
    into.payload = {
      ...into.payload,
      ratingIds: [...new Set([...(into.payload.ratingIds ?? []), ...(payload.ratingIds ?? [])])],
      flags: [...new Set([...(into.payload.flags ?? []), ...(payload.flags ?? [])])],
    };
    await updateReviewItemPayload(into.id, into.payload, tx);
    await closeReviewItem(
      item.id,
      {
        status: "RESOLVED",
        resolution: `merged into ${into.id}`,
        resolvedByUserId: adminId,
        resolvedAt: new Date(),
        payload,
      },
      tx,
    );
  }
  return items.length;
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

    // Steps 1-3: dishes, ratings, flags. The (city, dish) lists first, then the rows: the order
    // recomputeOne takes them in, so a merge never deadlocks with a recompute re-ranking a list.
    await lockCityDishLists(
      [
        ...(await listDishGroupsOfRestaurant(sourceId, tx)),
        ...(await listDishGroupsOfRestaurant(targetId, tx)),
      ],
      tx,
    );
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
      movedHeldRatingItems: 0,
      movedCandidates: 0,
      movedLocationObservations: 0,
      ownerMoved: owner.moveToTarget,
      overtureIdMoved: false,
      locationMoved: false,
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
      const photoOf = new Map(ratings.map((r) => [r.id, r.photoPath]));
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
        // The user keeps one rating where they had two.
        await adjustRatingCounters(
          older.userId,
          { ratings: -1, photos: photoOf.get(older.id) ? -1 : 0 },
          tx,
        );
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

      out.movedHeldRatingItems += await moveHeldRatingItems(
        pair.drop.id,
        pair.keep.id,
        admin.id,
        tx,
      );
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
    out.movedCandidates = (await moveCandidatesToRestaurant(sourceId, targetId, tx)).count;
    out.movedLocationObservations = (await moveLocationObservations(sourceId, targetId, tx)).count;

    // Steps 5-6: Overture id and location (the target keeps its own; it takes the source's only
    // when it has none; the unique overtureId is cleared on the source first), owner, status.
    const sourceUpdate: Prisma.RestaurantUncheckedUpdateInput = {
      status: "DUPLICATE",
      mergedIntoId: targetId,
      claimedByUserId: null,
      claimedAt: null,
    };
    const targetUpdate: Prisma.RestaurantUncheckedUpdateInput = {};
    if (source.overtureId && !target.overtureId) {
      sourceUpdate.overtureId = null;
      targetUpdate.overtureId = source.overtureId;
      out.overtureIdMoved = true;
    }
    if (
      source.lat !== null &&
      source.lng !== null &&
      (target.lat === null || target.lng === null)
    ) {
      Object.assign(targetUpdate, {
        lat: source.lat,
        lng: source.lng,
        locationSource: source.locationSource,
      });
      out.locationMoved = true;
    }
    if (owner.moveToTarget) {
      targetUpdate.claimedByUserId = source.claimedByUserId;
      targetUpdate.claimedAt = source.claimedAt;
    }
    await updateRestaurantById(sourceId, sourceUpdate, tx);
    if (Object.keys(targetUpdate).length > 0)
      await updateRestaurantById(targetId, targetUpdate, tx);
    return out;
  }, 60_000).catch(rethrowConflict);

  await afterCommit(result.recomputeIds);
  // The target now holds the source's dish rows: re-rank its lists (names break ties).
  await rerankRestaurant(targetId);
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
    movedHeldRatingItems: result.movedHeldRatingItems,
    movedCandidates: result.movedCandidates,
    movedLocationObservations: result.movedLocationObservations,
    ownerMoved: result.ownerMoved,
    overtureIdMoved: result.overtureIdMoved,
    locationMoved: result.locationMoved,
    durationMs: Date.now() - started,
  });
  return result;
}
