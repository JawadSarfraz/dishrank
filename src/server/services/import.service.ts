// /admin/import (docs/07 §2): live Places search, then Create / Link / Skip one result at a time.
// Google names and addresses are display only: they are returned to the admin's browser and
// nothing else. They are never saved, logged, cached or used to prefill (Maps Platform Terms
// 3.2.3(a)(iii)); only the place id, lat/lng and fetch time are saved, on Create or Link.
import { similarity } from "@/lib/trigram";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import {
  PlacesApiError,
  googleMapsUrl,
  type PlaceResult,
  type PlacesClient,
} from "@/server/places";
import { findAreaWithCityById, listCitiesWithAreas } from "@/server/repositories/geo.repo";
import {
  findRestaurantByGooglePlaceId,
  findRestaurantById,
  findRestaurantsByGooglePlaceIds,
  listRestaurantsForDedupe,
  lockRestaurants,
  updateRestaurantById,
} from "@/server/repositories/restaurant.repo";
import { listRestaurantDishPairs } from "@/server/repositories/restaurant-dish.repo";
import { findDishBySlug, listDishesForPicker } from "@/server/repositories/taxonomy.repo";
import { inTransaction } from "@/server/repositories/transaction";
import { assertRole, type SessionUser } from "@/server/roles";
import type { ImportCreateInput, ImportLinkInput, PlacesSearchInput } from "@/server/validation";
import { cleanText } from "./matching/normalize";
import { checkFetchedAt } from "./places-policy";
import { buildPlacesSearch } from "./places-query";
import { createRestaurant, ensureImportedDish } from "./restaurant.service";

export const IMPORT_RULES = {
  /** docs/07 §2: trigram similarity on the name within the searched area. */
  nameSimilarity: 0.6,
  maxDuplicates: 3,
} as const;

export type DedupeRestaurant = {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  areaId: string | null;
  googlePlaceId: string | null;
  area: { name: string } | null;
};

/**
 * Our restaurants in the same area whose name (or another name) has trigram similarity ≥ 0.6 with
 * a result's name. The result's name is compared in memory only.
 */
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

export type ImportRestaurantRef = {
  id: string;
  slug: string;
  name: string;
  areaName: string | null;
};

export type ImportSearchResult = {
  googlePlaceId: string;
  /** Google's name and address: display only. */
  displayName: string;
  formattedAddress: string;
  /** Saved only with a Create or Link (googleSyncedAt = the page's fetchedAt). */
  lat: number;
  lng: number;
  mapsUrl: string;
  /** imported: a restaurant already has this place id; possible_duplicate: a name match in the area. */
  status: "new" | "imported" | "possible_duplicate";
  existing: (ImportRestaurantRef & { hasDish: boolean }) | null;
  duplicates: (ImportRestaurantRef & { similarity: number })[];
};

export type ImportSearchPage = {
  dish: { slug: string; name: string };
  area: { id: string; slug: string; name: string };
  city: { id: string; slug: string; name: string };
  /** Time of the Google response: sent back with a Create or Link from this page. */
  fetchedAt: string;
  results: ImportSearchResult[];
  withoutLocation: number;
  nextPageToken: string | null;
};

/** One page of the live Text Search for a dish in an area, with dedupe against our restaurants. */
export async function searchPlacesForImport(
  actor: SessionUser | null,
  input: PlacesSearchInput,
  places: Pick<PlacesClient, "textSearch"> | null,
): Promise<ImportSearchPage> {
  const admin = assertRole(actor, "ADMIN");
  if (!places) {
    throw new AppError("PLACES_KEY_MISSING", "GOOGLE_PLACES_API_KEY is not set on the server", 503);
  }
  const dish = await findDishBySlug(input.dishSlug);
  if (!dish) throw new AppError("DISH_NOT_FOUND", `Unknown dish "${input.dishSlug}"`, 404);
  const area = await findAreaWithCityById(input.areaId);
  if (!area) throw new AppError("AREA_NOT_FOUND", "Unknown area", 404);

  const params = buildPlacesSearch({
    dish: { name: dish.name, categorySlug: dish.category.slug },
    area,
    city: area.city,
  });
  let page;
  try {
    page = await places.textSearch({ ...params, pageToken: input.pageToken });
  } catch (error) {
    if (!(error instanceof PlacesApiError)) throw error;
    logEvent("import.search.error", { userId: admin.id, status: error.describe() }, "warn");
    throw new AppError(
      "PLACES_ERROR",
      `Google Places answered ${error.describe()}. Search again${input.pageToken ? " from the first page" : ""}.`,
      502,
    );
  }

  const ids = page.places.map((p) => p.googlePlaceId);
  const existing = await findRestaurantsByGooglePlaceIds(ids);
  const existingByPlace = new Map(existing.map((r) => [r.googlePlaceId!, r]));
  const served = new Set(
    (
      await listRestaurantDishPairs(
        existing.map((r) => r.id),
        [dish.id],
      )
    ).map((p) => p.restaurantId),
  );
  const cityRestaurants = await listRestaurantsForDedupe(area.city.id);

  const results = page.places.map((place: PlaceResult): ImportSearchResult => {
    const base = {
      googlePlaceId: place.googlePlaceId,
      displayName: place.displayName,
      formattedAddress: place.formattedAddress,
      lat: place.lat,
      lng: place.lng,
      mapsUrl: googleMapsUrl(place.googlePlaceId, params.textQuery),
    };
    const same = existingByPlace.get(place.googlePlaceId);
    if (same) {
      return {
        ...base,
        status: "imported",
        existing: {
          id: same.id,
          slug: same.slug,
          name: same.name,
          areaName: same.area?.name ?? null,
          hasDish: served.has(same.id),
        },
        duplicates: [],
      };
    }
    const duplicates = findNameDuplicates(place.displayName, area.id, cityRestaurants).map((d) => ({
      id: d.restaurant.id,
      slug: d.restaurant.slug,
      name: d.restaurant.name,
      areaName: d.restaurant.area?.name ?? null,
      similarity: Math.round(d.similarity * 100) / 100,
    }));
    return {
      ...base,
      status: duplicates.length > 0 ? "possible_duplicate" : "new",
      existing: null,
      duplicates,
    };
  });

  logEvent("import.search", {
    userId: admin.id,
    dishSlug: dish.slug,
    areaSlug: area.slug,
    nextPage: Boolean(input.pageToken),
    results: results.length,
    imported: results.filter((r) => r.status === "imported").length,
    possibleDuplicates: results.filter((r) => r.status === "possible_duplicate").length,
  });
  return {
    dish: { slug: dish.slug, name: dish.name },
    area: { id: area.id, slug: area.slug, name: area.name },
    city: area.city,
    fetchedAt: page.fetchedAt.toISOString(),
    results,
    withoutLocation: page.withoutLocation,
    nextPageToken: page.nextPageToken ?? null,
  };
}

/** Create: name and address typed by the admin; place id, lat/lng and fetch time from the result. */
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
 * Link (docs/07 §2 step 3): to a restaurant without a googlePlaceId, save the result's place id,
 * lat/lng and googleSyncedAt = fetchedAt; then add the dish. A restaurant that already has a
 * different place id is not changed at all and the result stays a possible duplicate.
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

/** Cities with their areas and every dish (launch dishes first) for the search form. */
export async function getImportOptions(actor: SessionUser | null) {
  assertRole(actor, "ADMIN");
  const [cities, dishes] = await Promise.all([listCitiesWithAreas(), listDishesForPicker()]);
  return {
    cities: cities.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      areas: c.areas.map((a) => ({ id: a.id, slug: a.slug, name: a.name })),
    })),
    dishes,
  };
}
