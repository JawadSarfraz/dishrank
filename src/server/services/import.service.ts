// /admin/import (docs/07 §2): preview a seed CSV, then create or link rows one at a time.
// The preview writes nothing; Google names and addresses reach the DB only through the Create form
// the admin confirms (importCreate), as our own record.
import { CsvError } from "@/lib/csv";
import { haversineKm } from "@/lib/geo";
import { similarity } from "@/lib/trigram";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { findCityWithAreasById, listCitiesWithAreas } from "@/server/repositories/geo.repo";
import {
  findRestaurantByGooglePlaceId,
  findRestaurantById,
  findRestaurantsByGooglePlaceIds,
  listRestaurantsForDedupe,
  lockRestaurants,
  updateRestaurantById,
} from "@/server/repositories/restaurant.repo";
import { listRestaurantDishPairs } from "@/server/repositories/restaurant-dish.repo";
import { findDishBySlug, findDishesBySlugs } from "@/server/repositories/taxonomy.repo";
import { inTransaction } from "@/server/repositories/transaction";
import { assertRole, type SessionUser } from "@/server/roles";
import type { ImportCreateInput, ImportLinkInput } from "@/server/validation";
import { parseCandidatesCsv, type CandidateRow } from "./candidates-csv";
import { cleanText } from "./matching/normalize";
import { checkFetchedAt } from "./places-policy";
import { createRestaurant, ensureImportedDish } from "./restaurant.service";

export const IMPORT_RULES = {
  /** docs/07 §2: trigram similarity on the name within the same area. */
  nameSimilarity: 0.6,
  maxDuplicates: 3,
  /** Text Search only biases to the area: rows this far from every area centre get a warning. */
  // DECISION-PENDING: 10 km warning distance for rows that may lie outside the city.
  farFromCityKm: 10,
} as const;

type Area = { id: string; slug: string; name: string; lat: number; lng: number };

/** The area whose centre is nearest to the place: the Create form's suggested area. */
export function nearestArea(
  point: { lat: number; lng: number },
  areas: readonly Area[],
): { area: Area; distanceKm: number } | null {
  let best: { area: Area; distanceKm: number } | null = null;
  for (const area of areas) {
    const distanceKm = haversineKm(point, area);
    if (!best || distanceKm < best.distanceKm) best = { area, distanceKm };
  }
  return best;
}

export type DedupeRestaurant = {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  areaId: string | null;
  googlePlaceId: string | null;
  area: { name: string } | null;
};

/** Restaurants in the same area whose name (or another name) has trigram similarity ≥ 0.6. */
export function findNameDuplicates(
  name: string,
  areaId: string,
  restaurants: readonly DedupeRestaurant[],
) {
  const text = cleanText(name);
  if (!text) return [];
  return restaurants
    .filter((r) => r.areaId === areaId)
    .map((r) => ({
      restaurant: r,
      similarity: Math.max(...[r.name, ...r.aliases].map((n) => similarity(cleanText(n), text))),
    }))
    .filter((d) => d.similarity >= IMPORT_RULES.nameSimilarity)
    .sort(
      (a, b) => b.similarity - a.similarity || a.restaurant.name.localeCompare(b.restaurant.name),
    )
    .slice(0, IMPORT_RULES.maxDuplicates);
}

export type PreviewRestaurant = { id: string; slug: string; name: string; areaName: string | null };

export type PreviewRow =
  | {
      line: number;
      status: "rejected";
      reasons: string[];
      googlePlaceId: string;
      displayName: string;
      dishSlug: string;
    }
  | {
      line: number;
      /** imported: a restaurant already has this googlePlaceId; possible_duplicate: name match in the area. */
      status: "new" | "imported" | "possible_duplicate";
      candidate: CandidateRow;
      ageDays: number;
      dish: { slug: string; name: string };
      suggestedArea: { id: string; name: string; distanceKm: number };
      warnings: string[];
      existing: (PreviewRestaurant & { hasDish: boolean }) | null;
      duplicates: (PreviewRestaurant & { similarity: number })[];
    };

export type ImportPreview = {
  city: { id: string; slug: string; name: string; areas: { id: string; name: string }[] };
  rows: PreviewRow[];
  counts: Record<PreviewRow["status"], number>;
};

/** Parses and checks the CSV, finds existing and possible duplicate restaurants. Writes nothing. */
export async function previewImport(
  actor: SessionUser | null,
  input: { cityId: string; csvText: string },
  now: Date = new Date(),
): Promise<ImportPreview> {
  assertRole(actor, "ADMIN");
  const city = await findCityWithAreasById(input.cityId);
  if (!city) throw new AppError("CITY_NOT_FOUND", "Unknown city", 404);

  let parsed;
  try {
    parsed = parseCandidatesCsv(input.csvText, now);
  } catch (error) {
    if (error instanceof CsvError) throw new AppError("CSV_INVALID", error.message, 400);
    throw error;
  }
  const valid = parsed.flatMap((p) => (p.ok ? [p] : []));
  const dishes = await findDishesBySlugs([...new Set(valid.map((p) => p.row.dishSlug))]);
  const dishBySlug = new Map(dishes.map((d) => [d.slug, d]));
  const existing = await findRestaurantsByGooglePlaceIds(valid.map((p) => p.row.googlePlaceId));
  const existingByPlace = new Map(existing.map((r) => [r.googlePlaceId!, r]));
  const pairs = await listRestaurantDishPairs(
    existing.map((r) => r.id),
    dishes.map((d) => d.id),
  );
  const servedPairs = new Set(pairs.map((p) => `${p.restaurantId}:${p.dishId}`));
  const cityRestaurants = await listRestaurantsForDedupe(city.id);
  const cityAreaSlugs = new Set(city.areas.map((a) => a.slug));
  const firstLineOfPlace = new Map<string, number>();

  const rows = parsed.map((p): PreviewRow => {
    if (!p.ok) {
      return {
        line: p.line,
        status: "rejected",
        reasons: p.reasons,
        googlePlaceId: p.raw.googlePlaceId ?? "",
        displayName: p.raw.displayName ?? "",
        dishSlug: p.raw.dishSlug ?? "",
      };
    }
    const reasons: string[] = [];
    const dish = dishBySlug.get(p.row.dishSlug);
    if (!dish) reasons.push(`Unknown dish "${p.row.dishSlug}"`);
    if (!cityAreaSlugs.has(p.row.queryArea)) {
      reasons.push(
        `queryArea "${p.row.queryArea}" is not an area of ${city.name}: is this the CSV's city?`,
      );
    }
    const firstLine = firstLineOfPlace.get(p.row.googlePlaceId);
    if (firstLine) reasons.push(`Same Google place as line ${firstLine}`);
    else firstLineOfPlace.set(p.row.googlePlaceId, p.line);
    if (!dish || reasons.length > 0) {
      return {
        line: p.line,
        status: "rejected",
        reasons,
        googlePlaceId: p.row.googlePlaceId,
        displayName: p.row.displayName,
        dishSlug: p.row.dishSlug,
      };
    }

    const nearest = nearestArea(p.row, city.areas)!;
    const warnings: string[] = [];
    if (nearest.distanceKm > IMPORT_RULES.farFromCityKm) {
      warnings.push(
        `${Math.round(nearest.distanceKm)} km from the nearest ${city.name} area: check that it is in ${city.name}.`,
      );
    }
    const base = {
      line: p.line,
      candidate: p.row,
      ageDays: p.ageDays,
      dish: { slug: dish.slug, name: dish.name },
      suggestedArea: {
        id: nearest.area.id,
        name: nearest.area.name,
        distanceKm: Math.round(nearest.distanceKm * 10) / 10,
      },
      warnings,
    };

    const same = existingByPlace.get(p.row.googlePlaceId);
    if (same) {
      if (same.cityId !== city.id) warnings.push(`Already imported in ${same.city.name}.`);
      return {
        ...base,
        status: "imported",
        existing: {
          id: same.id,
          slug: same.slug,
          name: same.name,
          areaName: same.area?.name ?? null,
          hasDish: servedPairs.has(`${same.id}:${dish.id}`),
        },
        duplicates: [],
      };
    }
    const duplicates = findNameDuplicates(p.row.displayName, nearest.area.id, cityRestaurants).map(
      (d) => ({
        id: d.restaurant.id,
        slug: d.restaurant.slug,
        name: d.restaurant.name,
        areaName: d.restaurant.area?.name ?? null,
        similarity: Math.round(d.similarity * 100) / 100,
      }),
    );
    return {
      ...base,
      status: duplicates.length > 0 ? "possible_duplicate" : "new",
      existing: null,
      duplicates,
    };
  });

  const counts = { rejected: 0, new: 0, imported: 0, possible_duplicate: 0 };
  for (const row of rows) counts[row.status]++;
  logEvent("import.preview", { userId: actor!.id, cityId: city.id, rows: rows.length, ...counts });
  return {
    city: {
      id: city.id,
      slug: city.slug,
      name: city.name,
      areas: city.areas.map((a) => ({ id: a.id, name: a.name })),
    },
    rows,
    counts,
  };
}

/** Create: the admin-confirmed form for one row; googleSyncedAt = the row's fetchedAt. */
export async function importCreate(
  actor: SessionUser | null,
  input: ImportCreateInput,
  now: Date = new Date(),
) {
  assertRole(actor, "ADMIN");
  const dish = await findDishBySlug(input.dishSlug);
  if (!dish) throw new AppError("DISH_NOT_FOUND", `Unknown dish "${input.dishSlug}"`, 404);
  const { name, cityId, areaId, address, lat, lng, phone, priceBand, aliases } = input;
  const { googlePlaceId, fetchedAt } = input;
  return createRestaurant(
    actor,
    {
      name,
      cityId,
      areaId,
      address,
      lat,
      lng,
      phone,
      priceBand,
      aliases,
      googlePlaceId,
      fetchedAt,
    },
    { dishId: dish.id, now },
  );
}

export type LinkResult =
  | {
      outcome: "linked";
      restaurant: { id: string; slug: string; name: string };
      citySlug: string;
      placeLinked: boolean;
      restaurantDish: { id: string; status: string; created: boolean };
    }
  | {
      outcome: "possible_duplicate";
      restaurant: { id: string; slug: string; name: string };
      message: string;
    };

/**
 * Link (docs/07 §2 step 3): to a restaurant without a googlePlaceId, save the row's place id,
 * lat/lng and googleSyncedAt = fetchedAt; then add the dish. A restaurant that already has a
 * different place id is not changed at all and the row stays a possible duplicate.
 */
export async function importLink(
  actor: SessionUser | null,
  input: ImportLinkInput,
  now: Date = new Date(),
): Promise<LinkResult> {
  const admin = assertRole(actor, "ADMIN");
  const fresh = checkFetchedAt(input.fetchedAt, now);
  if (!fresh.ok) throw new AppError("GOOGLE_DATA_TOO_OLD", fresh.reason, 400);
  const dish = await findDishBySlug(input.dishSlug);
  if (!dish) throw new AppError("DISH_NOT_FOUND", `Unknown dish "${input.dishSlug}"`, 404);

  const result = await inTransaction(async (tx): Promise<LinkResult> => {
    await lockRestaurants([input.restaurantId], tx);
    const restaurant = await findRestaurantById(input.restaurantId, tx);
    if (!restaurant) throw new AppError("NOT_FOUND", "Restaurant not found", 404);
    if (restaurant.status === "DUPLICATE") {
      throw new AppError("RESTAURANT_MERGED", "This restaurant was merged into another one", 409);
    }
    const summary = { id: restaurant.id, slug: restaurant.slug, name: restaurant.name };
    if (restaurant.googlePlaceId && restaurant.googlePlaceId !== input.googlePlaceId) {
      return {
        outcome: "possible_duplicate",
        restaurant: summary,
        message: `${restaurant.name} is already linked to another Google place, so nothing changed. If both are the same restaurant, merge them in /admin/restaurants.`,
      };
    }
    let placeLinked = false;
    if (!restaurant.googlePlaceId) {
      const other = await findRestaurantByGooglePlaceId(input.googlePlaceId, tx);
      if (other) {
        throw new AppError(
          "PLACE_ALREADY_LINKED",
          `This Google place is already linked to ${other.name}`,
          409,
          { restaurantId: other.id, slug: other.slug },
        );
      }
      await updateRestaurantById(
        restaurant.id,
        {
          googlePlaceId: input.googlePlaceId,
          lat: input.lat,
          lng: input.lng,
          googleSyncedAt: fresh.fetchedAt,
        },
        tx,
      );
      placeLinked = true;
    }
    const restaurantDish = await ensureImportedDish(restaurant, dish.id, tx);
    return {
      outcome: "linked",
      restaurant: summary,
      citySlug: restaurant.city.slug,
      placeLinked,
      restaurantDish,
    };
  });

  logEvent("import.link", {
    userId: admin.id,
    entityId: input.restaurantId,
    googlePlaceId: input.googlePlaceId,
    dishSlug: input.dishSlug,
    outcome: result.outcome,
    ...(result.outcome === "linked"
      ? { placeLinked: result.placeLinked, restaurantDishCreated: result.restaurantDish.created }
      : {}),
  });
  return result;
}

/** Cities with their areas for the upload form. */
export async function getImportCities(actor: SessionUser | null) {
  assertRole(actor, "ADMIN");
  const cities = await listCitiesWithAreas();
  return cities.map((c) => ({ id: c.id, slug: c.slug, name: c.name }));
}
