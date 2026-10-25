// /admin/import (docs/07 §2): review Overture candidates one area at a time. Per candidate the
// admin Creates a restaurant (form prefilled from Overture, CLAUDE.md rule 2), Links it to one we
// have, or Skips it. Every write checks that the candidate is still NEW, under a row lock.
import type { CandidateStatus } from "@/generated/prisma/client";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { listCitiesWithAreas } from "@/server/repositories/geo.repo";
import {
  countNewCandidatesByArea,
  listCandidatesForReview,
  listLocatedCandidates,
  lockCandidate,
  updateCandidate,
} from "@/server/repositories/overture.repo";
import {
  findRestaurantById,
  findRestaurantByOvertureId,
  listRestaurantsForDedupe,
  lockRestaurants,
  updateRestaurantById,
} from "@/server/repositories/restaurant.repo";
import { listLaunchDishAliases, listLaunchDishes } from "@/server/repositories/taxonomy.repo";
import { inTransaction, type Tx } from "@/server/repositories/transaction";
import { assertRole, type SessionUser } from "@/server/roles";
import type {
  CandidateCreateInput,
  CandidateLinkInput,
  CandidateSkipInput,
  ImportQueueQuery,
} from "@/server/validation";
import { rethrowConflict } from "./conflict";
import { suggestDishes } from "./overture/dish-hints";
import {
  NearbyIndex,
  candidateHints,
  restaurantHints,
  type RestaurantHint,
} from "./overture/duplicates";
import { compareReleases } from "./overture/places";
import { latestOvertureSync } from "./overture-sync.service";
import { addAdminDishesTx, insertRestaurantTx, resolveDishSlugs } from "./restaurant.service";

/** Candidates shown at once; an area has at most a few hundred. */
export const QUEUE_LIMIT = 300;

const SHOW: Record<NonNullable<ImportQueueQuery["show"]>, CandidateStatus[]> = {
  new: ["NEW"],
  skipped: ["SKIPPED"],
  done: ["CREATED", "LINKED"],
};

export type CandidateHint = {
  id: string;
  name: string;
  metres: number;
  status: CandidateStatus;
  skipReason: string | null;
  restaurant: { id: string; slug: string; name: string } | null;
};

export type QueueCandidate = {
  id: string;
  overtureId: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  /** Overture categories, readable ("pizza restaurant"). */
  categories: string[];
  confidence: number;
  location: { lat: number; lng: number } | null;
  sources: string[];
  suggestedArea: { id: string; name: string } | null;
  status: CandidateStatus;
  skipReason: string | null;
  restaurant: { id: string; slug: string; name: string } | null;
  /** The newest synced release no longer has this place (it may have closed). */
  missingFromLatest: boolean;
  /** Launch dishes to pre-tick. */
  dishSlugs: string[];
  likelyRestaurants: RestaurantHint[];
  likelyCandidates: CandidateHint[];
};

const readable = (category: string) => category.replace(/_/g, " ");

/** Cities and areas with NEW counts, then the chosen area's candidates with their hints. */
export async function getImportQueue(actor: SessionUser | null, query: ImportQueueQuery) {
  assertRole(actor, "ADMIN");
  const [cities, launchDishes, aliases, sync] = await Promise.all([
    listCitiesWithAreas(),
    listLaunchDishes(),
    listLaunchDishAliases(),
    latestOvertureSync(),
  ]);
  const city = cities.find((c) => c.slug === query.city) ?? cities[0];
  if (!city) throw new AppError("NO_CITIES", "Run pnpm db:seed first", 500);
  const counts = await countNewCandidatesByArea(city.id);
  const areas = city.areas.map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    newCount: counts.get(a.id) ?? 0,
  }));
  const noAreaCount = counts.get(null) ?? 0;

  // The chosen area ("none": candidates without a suggested area), else the busiest one.
  const busiest = [...areas].sort(
    (a, b) => b.newCount - a.newCount || a.name.localeCompare(b.name),
  )[0];
  const area =
    query.area === "none" ? null : (areas.find((a) => a.slug === query.area) ?? busiest ?? null);
  const show = query.show ?? "new";

  const [{ items, total }, located, restaurants] = await Promise.all([
    listCandidatesForReview({
      cityId: city.id,
      areaId: area?.id ?? null,
      statuses: SHOW[show],
      take: QUEUE_LIMIT,
    }),
    listLocatedCandidates(city.id),
    listRestaurantsForDedupe(city.id),
  ]);
  const candidateIndex = new NearbyIndex(located.map((c) => ({ ...c, lat: c.lat!, lng: c.lng! })));
  const restaurantIndex = new NearbyIndex(
    restaurants.flatMap((r) =>
      r.lat !== null && r.lng !== null ? [{ ...r, lat: r.lat, lng: r.lng }] : [],
    ),
  );

  const candidates = items.map((c): QueueCandidate => {
    const categories = [c.category, ...c.alternates].filter((x): x is string => Boolean(x));
    const hinted = suggestDishes(c.name, categories, aliases);
    return {
      id: c.id,
      overtureId: c.overtureId,
      name: c.name,
      address: c.address,
      phone: c.phone,
      website: c.website,
      categories: [...new Set(categories.map(readable))],
      confidence: c.confidence,
      location: c.lat !== null && c.lng !== null ? { lat: c.lat, lng: c.lng } : null,
      sources: c.sources,
      suggestedArea: c.suggestedArea
        ? { id: c.suggestedArea.id, name: c.suggestedArea.name }
        : null,
      status: c.status,
      skipReason: c.skipReason,
      restaurant: c.restaurant,
      missingFromLatest: sync !== null && compareReleases(c.lastSeenRelease, sync.release) < 0,
      dishSlugs: launchDishes.map((d) => d.slug).filter((slug) => hinted.has(slug)),
      likelyRestaurants: restaurantHints(c, restaurants, restaurantIndex).filter(
        (h) => h.id !== c.restaurantId,
      ),
      likelyCandidates: candidateHints(c, candidateIndex).map(({ point, metres }) => ({
        id: point.id,
        name: point.name,
        metres,
        status: point.status,
        skipReason: point.skipReason,
        restaurant: point.restaurant,
      })),
    };
  });

  return {
    cities: cities.map((c) => ({ slug: c.slug, name: c.name })),
    city: { id: city.id, slug: city.slug, name: city.name },
    areas,
    noAreaCount,
    area: area ? { id: area.id, slug: area.slug, name: area.name } : null,
    show,
    total,
    candidates,
    /** Both cities' areas for the Create form: a place near the city line may belong to the other. */
    formCities: cities.map((c) => ({
      id: c.id,
      name: c.name,
      areas: c.areas.map((a) => ({ id: a.id, name: a.name })),
    })),
    launchDishes: launchDishes.map((d) => ({ slug: d.slug, name: d.name })),
    release: sync?.release ?? null,
  };
}

export type ImportQueue = Awaited<ReturnType<typeof getImportQueue>>;

async function lockNewCandidate(candidateId: string, tx: Tx) {
  const candidate = await lockCandidate(candidateId, tx);
  if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found", 404);
  if (candidate.status !== "NEW") {
    throw new AppError(
      "CANDIDATE_REVIEWED",
      `This place was already reviewed (${candidate.status.toLowerCase()})`,
      409,
    );
  }
  return candidate;
}

/**
 * Create: a restaurant from the admin's confirmed form (source OVERTURE, the candidate's GERS id,
 * Overture's coordinates when it has a location), a CANDIDATE row per ticked dish, and the
 * candidate becomes CREATED.
 */
export async function createFromCandidate(
  actor: SessionUser | null,
  input: CandidateCreateInput,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  const dishIds = await resolveDishSlugs(input.dishSlugs);
  const result = await inTransaction(async (tx) => {
    const candidate = await lockNewCandidate(input.candidateId, tx);
    const restaurant = await insertRestaurantTx(
      {
        name: input.name,
        areaId: input.areaId,
        address: input.address,
        phone: input.phone,
        website: input.website,
        priceBand: input.priceBand,
        aliases: input.aliases,
        source: "OVERTURE",
        overtureId: candidate.overtureId,
        location:
          candidate.lat !== null && candidate.lng !== null
            ? { lat: candidate.lat, lng: candidate.lng, source: "OVERTURE" }
            : null,
      },
      tx,
    );
    const dishes = await addAdminDishesTx(restaurant, dishIds, tx);
    await updateCandidate(
      candidate.id,
      {
        status: "CREATED",
        restaurantId: restaurant.id,
        reviewedByUserId: admin.id,
        reviewedAt: now,
      },
      tx,
    );
    const saved = await findRestaurantById(restaurant.id, tx);
    return { restaurant, dishes, citySlug: saved!.city.slug };
  }).catch(rethrowConflict);
  logEvent("import.create", {
    userId: admin.id,
    candidateId: input.candidateId,
    entityId: result.restaurant.id,
    restaurantDishIds: result.dishes.map((d) => d.id),
  });
  return result;
}

/**
 * Link: the candidate is a restaurant we have. The restaurant takes the candidate's GERS id when
 * it has none, and Overture's coordinates when it has no location; nothing else changes.
 */
// DECISION-PENDING: Link fills a missing location and overtureId from the candidate, never overwrites them.
export async function linkCandidate(
  actor: SessionUser | null,
  input: CandidateLinkInput,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  const result = await inTransaction(async (tx) => {
    const candidate = await lockNewCandidate(input.candidateId, tx);
    await lockRestaurants([input.restaurantId], tx);
    const restaurant = await findRestaurantById(input.restaurantId, tx);
    if (!restaurant) throw new AppError("NOT_FOUND", "Restaurant not found", 404);
    if (restaurant.status === "DUPLICATE") {
      throw new AppError("RESTAURANT_MERGED", "This restaurant was merged into another one", 409);
    }
    const update: { overtureId?: string; lat?: number; lng?: number; locationSource?: "OVERTURE" } =
      {};
    if (!restaurant.overtureId && !(await findRestaurantByOvertureId(candidate.overtureId, tx))) {
      update.overtureId = candidate.overtureId;
    }
    if (
      (restaurant.lat === null || restaurant.lng === null) &&
      candidate.lat !== null &&
      candidate.lng !== null
    ) {
      Object.assign(update, { lat: candidate.lat, lng: candidate.lng, locationSource: "OVERTURE" });
    }
    if (Object.keys(update).length > 0) await updateRestaurantById(restaurant.id, update, tx);
    await updateCandidate(
      candidate.id,
      {
        status: "LINKED",
        restaurantId: restaurant.id,
        reviewedByUserId: admin.id,
        reviewedAt: now,
      },
      tx,
    );
    return {
      restaurant: { id: restaurant.id, slug: restaurant.slug, name: restaurant.name },
      citySlug: restaurant.city.slug,
      overtureIdSet: update.overtureId !== undefined,
      locationSet: update.lat !== undefined,
    };
  }).catch(rethrowConflict);
  logEvent("import.link", {
    userId: admin.id,
    candidateId: input.candidateId,
    entityId: input.restaurantId,
    overtureIdSet: result.overtureIdSet,
    locationSet: result.locationSet,
  });
  return result;
}

/** Skip: not imported; the reason is optional. Reopen undoes it. */
export async function skipCandidate(
  actor: SessionUser | null,
  input: CandidateSkipInput,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  await inTransaction(async (tx) => {
    const candidate = await lockNewCandidate(input.candidateId, tx);
    await updateCandidate(
      candidate.id,
      {
        status: "SKIPPED",
        skipReason: input.reason ?? null,
        reviewedByUserId: admin.id,
        reviewedAt: now,
      },
      tx,
    );
  });
  logEvent("import.skip", {
    userId: admin.id,
    candidateId: input.candidateId,
    reason: input.reason ?? null,
  });
  return { id: input.candidateId, reason: input.reason ?? null };
}

export async function reopenCandidate(actor: SessionUser | null, candidateId: string) {
  const admin = assertRole(actor, "ADMIN");
  await inTransaction(async (tx) => {
    const candidate = await lockCandidate(candidateId, tx);
    if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found", 404);
    if (candidate.status !== "SKIPPED") {
      throw new AppError("CANDIDATE_NOT_SKIPPED", "Only a skipped place can be reopened", 409);
    }
    await updateCandidate(
      candidate.id,
      { status: "NEW", skipReason: null, reviewedByUserId: null, reviewedAt: null },
      tx,
    );
  });
  logEvent("import.reopen", { userId: admin.id, candidateId });
  return { id: candidateId };
}

/** Areas of both cities and the launch dishes, for /admin/restaurants/new. */
export async function getRestaurantFormOptions(actor: SessionUser | null) {
  assertRole(actor, "ADMIN");
  const [cities, launchDishes] = await Promise.all([listCitiesWithAreas(), listLaunchDishes()]);
  return {
    cities: cities.map((c) => ({
      id: c.id,
      name: c.name,
      areas: c.areas.map((a) => ({ id: a.id, name: a.name })),
    })),
    launchDishes: launchDishes.map((d) => ({ slug: d.slug, name: d.name })),
  };
}
