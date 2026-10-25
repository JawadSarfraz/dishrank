// Candidate seeding (docs/07 §1): Text Search per area → CSV rows. Reads the city, areas and dish
// from the DB; never writes to it. Google results only ever go to the scratch CSV in tmp/.
import {
  PlacesApiError,
  PlacesBudgetError,
  TEXT_SEARCH,
  type PlacesClient,
  type TextSearchParams,
} from "@/server/places";
import { AppError } from "@/server/errors";
import { findCityWithAreasBySlug } from "@/server/repositories/geo.repo";
import { findDishBySlug } from "@/server/repositories/taxonomy.repo";
import type { CandidateRow } from "./candidates-csv";

/**
 * includedType only biases results (strictTypeFiltering stays false), but the bias still pushes
 * other venues down the list. Tea stalls, halwa-puri shops, sweet shops and street stalls are often
 * typed cafe, tea_house, bakery or nothing at all, so dishes in these categories search without a type.
 */
// DECISION-PENDING: which dish categories search without includedType "restaurant" (docs/OPEN-QUESTIONS.md).
export const UNTYPED_SEARCH_CATEGORIES: readonly string[] = [
  "breakfast",
  "drinks",
  "desserts",
  "street-food",
];

export function includedTypeFor(categorySlug: string): string | undefined {
  return UNTYPED_SEARCH_CATEGORIES.includes(categorySlug) ? undefined : "restaurant";
}

export type SeedTarget = {
  city: { slug: string; name: string };
  dish: { slug: string; name: string; categorySlug: string };
  areas: { slug: string; name: string; lat: number; lng: number }[];
};

/** City, dish and areas (all of the city's, or the --areas subset) from the DB. */
export async function loadSeedTarget(input: {
  citySlug: string;
  dishSlug: string;
  areaSlugs?: readonly string[];
}): Promise<SeedTarget> {
  const city = await findCityWithAreasBySlug(input.citySlug);
  if (!city) throw new AppError("CITY_NOT_FOUND", `Unknown city "${input.citySlug}"`, 404);
  const dish = await findDishBySlug(input.dishSlug);
  if (!dish) throw new AppError("DISH_NOT_FOUND", `Unknown dish "${input.dishSlug}"`, 404);

  let areas = city.areas;
  if (input.areaSlugs?.length) {
    const unknown = input.areaSlugs.filter((s) => !city.areas.some((a) => a.slug === s));
    if (unknown.length > 0) {
      throw new AppError(
        "AREA_NOT_FOUND",
        `Unknown areas in ${city.slug}: ${unknown.join(", ")}. Known: ${city.areas.map((a) => a.slug).join(", ")}`,
        404,
      );
    }
    areas = city.areas.filter((a) => input.areaSlugs!.includes(a.slug));
  }
  return {
    city: { slug: city.slug, name: city.name },
    dish: { slug: dish.slug, name: dish.name, categorySlug: dish.category.slug },
    areas: areas.map(({ slug, name, lat, lng }) => ({ slug, name, lat, lng })),
  };
}

export type PlannedQuery = { areaSlug: string; params: TextSearchParams };

/** One query per area: "<dish name> <area name> <city>", biased to a 2.5 km circle on the area. */
export function planSeedQueries(target: SeedTarget): PlannedQuery[] {
  const includedType = includedTypeFor(target.dish.categorySlug);
  return target.areas.map((area) => ({
    areaSlug: area.slug,
    params: {
      textQuery: `${target.dish.name} ${area.name} ${target.city.name}`,
      includedType,
      center: { latitude: area.lat, longitude: area.lng },
    },
  }));
}

/** Upper bound of Text Search calls without retries: every area may return 3 pages. */
export function maxCallsFor(queries: readonly PlannedQuery[]): number {
  return queries.length * TEXT_SEARCH.maxPages;
}

export type AreaResult = {
  areaSlug: string;
  pages: number;
  results: number;
  /** Places not already returned for an earlier area. */
  newPlaces: number;
  withoutLocation: number;
  error?: string;
};

export type SeedRun = {
  rows: CandidateRow[];
  areas: AreaResult[];
  calls: number;
  /** Why the run stopped before searching every area (budget or a Google error), if it did. */
  stoppedEarly?: string;
  notSearched: string[];
};

/**
 * Runs the planned queries in order, up to 3 pages each, deduping by place id (first area wins).
 * fetchedAt is the time of the page's response. Stops when the call budget is reached, or at the
 * first page-1 error that a retry cannot fix (bad key, disabled API, invalid request), because
 * every other area would fail the same way.
 */
export async function runSeedQueries(
  client: PlacesClient,
  queries: readonly PlannedQuery[],
  dishSlug: string,
  onArea?: (result: AreaResult) => void,
): Promise<SeedRun> {
  const seen = new Set<string>();
  const rows: CandidateRow[] = [];
  const areas: AreaResult[] = [];
  const notSearched: string[] = [];
  let stoppedEarly: string | undefined;

  for (const query of queries) {
    if (stoppedEarly) {
      notSearched.push(query.areaSlug);
      continue;
    }
    const result: AreaResult = {
      areaSlug: query.areaSlug,
      pages: 0,
      results: 0,
      newPlaces: 0,
      withoutLocation: 0,
    };
    let pageToken: string | undefined;
    try {
      do {
        const page = await client.textSearch({ ...query.params, pageToken });
        result.pages++;
        result.results += page.places.length;
        result.withoutLocation += page.withoutLocation;
        for (const place of page.places) {
          if (seen.has(place.googlePlaceId)) continue;
          seen.add(place.googlePlaceId);
          result.newPlaces++;
          rows.push({
            ...place,
            queryArea: query.areaSlug,
            dishSlug,
            fetchedAt: page.fetchedAt.toISOString(),
          });
        }
        pageToken = page.nextPageToken;
      } while (pageToken && result.pages < TEXT_SEARCH.maxPages);
    } catch (error) {
      if (error instanceof PlacesBudgetError) {
        result.error = "call budget reached";
        stoppedEarly = `call budget reached after ${error.calls} calls`;
      } else if (error instanceof PlacesApiError) {
        result.error = error.describe();
        if (result.pages === 0 && error.httpStatus >= 400 && error.httpStatus < 500) {
          stoppedEarly = `Google answered ${error.describe()}`;
        }
      } else {
        throw error;
      }
    }
    areas.push(result);
    onArea?.(result);
  }
  return { rows, areas, calls: client.calls, stoppedEarly, notSearched };
}
