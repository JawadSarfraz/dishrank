// pnpm seed:places (docs/07 §1): a planning tool only. It runs the same Text Search queries as the
// live search on /admin/import, but with the IDs-only field mask (Text Search Essentials IDs Only,
// no charge), and prints per-area counts and the Text Search Pro calls a full live import would
// take. Google names and addresses are never requested; it writes no file and never writes the DB.
import { parseArgs } from "node:util";
import { isSlug } from "@/lib/slug";
import { AppError } from "@/server/errors";
import {
  PlacesApiError,
  PlacesBudgetError,
  TEXT_SEARCH,
  type PlacesClient,
  type TextSearchParams,
} from "@/server/places";
import { findCityWithAreasBySlug } from "@/server/repositories/geo.repo";
import { findDishBySlug } from "@/server/repositories/taxonomy.repo";
import { buildPlacesSearch } from "./places-query";

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

/** One query per area, exactly as /admin/import sends it (docs/07 §2). */
export function planSeedQueries(target: SeedTarget): PlannedQuery[] {
  return target.areas.map((area) => ({
    areaSlug: area.slug,
    params: buildPlacesSearch({ dish: target.dish, area, city: target.city }),
  }));
}

/** Upper bound of Text Search calls without retries: every area may return 3 pages. */
export function maxCallsFor(queries: readonly PlannedQuery[]): number {
  return queries.length * TEXT_SEARCH.maxPages;
}

export type AreaCount = {
  areaSlug: string;
  /** Pages Google returned: the Text Search Pro calls the live search needs to show them all. */
  pages: number;
  results: number;
  /** Places not already returned for an earlier area. */
  newPlaces: number;
  error?: string;
};

export type PlanningRun = {
  areas: AreaCount[];
  uniquePlaces: number;
  calls: number;
  /** Why the run stopped before searching every area (budget or a Google error), if it did. */
  stoppedEarly?: string;
  notSearched: string[];
};

/**
 * Runs the planned queries in order, up to 3 pages each, counting unique place ids. Stops at the
 * call budget, or at a page-1 error a retry cannot fix (bad key, disabled API, invalid request),
 * because every other area would fail the same way.
 */
export async function runPlanningQueries(
  client: Pick<PlacesClient, "textSearchIds" | "calls">,
  queries: readonly PlannedQuery[],
  onArea?: (result: AreaCount) => void,
): Promise<PlanningRun> {
  const seen = new Set<string>();
  const areas: AreaCount[] = [];
  const notSearched: string[] = [];
  let stoppedEarly: string | undefined;

  for (const query of queries) {
    if (stoppedEarly) {
      notSearched.push(query.areaSlug);
      continue;
    }
    const result: AreaCount = { areaSlug: query.areaSlug, pages: 0, results: 0, newPlaces: 0 };
    let pageToken: string | undefined;
    try {
      do {
        const page = await client.textSearchIds({ ...query.params, pageToken });
        result.pages++;
        result.results += page.placeIds.length;
        for (const id of page.placeIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          result.newPlaces++;
        }
        pageToken = page.nextPageToken;
      } while (pageToken && result.pages < TEXT_SEARCH.maxPages);
    } catch (error) {
      if (error instanceof PlacesBudgetError) {
        result.error = "call budget reached";
        stoppedEarly = `call budget reached after ${error.calls} calls`;
      } else if (error instanceof PlacesApiError) {
        result.error = error.describe(); // status codes only: Google's error text is never kept
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
  return { areas, uniquePlaces: seen.size, calls: client.calls, stoppedEarly, notSearched };
}

export class UsageError extends Error {}

export const SEED_PLACES_USAGE =
  "Usage: pnpm seed:places -- --city=<city> --dish=<dish> [--areas=<a,b>] [--dry-run] [--max-calls=<n>]";

const DEFAULT_MAX_CALLS = 150;

export function parseSeedPlacesArgs(argv: readonly string[]) {
  const args = argv[0] === "--" ? argv.slice(1) : [...argv]; // `pnpm run x -- …` passes "--" on
  let values;
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      options: {
        city: { type: "string" },
        dish: { type: "string" },
        areas: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        "max-calls": { type: "string" },
      },
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const city = values.city?.trim() ?? "";
  const dish = values.dish?.trim() ?? "";
  if (!isSlug(city) || !isSlug(dish)) throw new UsageError("--city and --dish are required slugs.");
  const areas = values.areas
    ?.split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (areas?.some((a) => !isSlug(a)))
    throw new UsageError("--areas must be comma-separated slugs.");
  const maxCalls =
    values["max-calls"] === undefined ? DEFAULT_MAX_CALLS : Number(values["max-calls"]);
  if (!Number.isInteger(maxCalls) || maxCalls < 1) {
    throw new UsageError("--max-calls must be a positive integer.");
  }
  return { city, dish, areas, dryRun: values["dry-run"] ?? false, maxCalls };
}

export type SeedPlacesDeps = {
  print: (line: string) => void;
  printError: (line: string) => void;
  /** null when GOOGLE_PLACES_API_KEY is missing. */
  createClient: (maxCalls: number) => Pick<PlacesClient, "textSearchIds" | "calls"> | null;
};

/** The CLI behind scripts/seed-places.ts. Returns the exit code; prints only slugs and counts. */
export async function runSeedPlaces(
  argv: readonly string[],
  deps: SeedPlacesDeps,
): Promise<number> {
  let cli;
  try {
    cli = parseSeedPlacesArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    deps.printError(`seed:places: ${error.message}\n${SEED_PLACES_USAGE}`);
    return 1;
  }
  let target;
  try {
    target = await loadSeedTarget({ citySlug: cli.city, dishSlug: cli.dish, areaSlugs: cli.areas });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    deps.printError(`seed:places: ${error.message}`);
    return 1;
  }
  const queries = planSeedQueries(target);
  const maxCalls = maxCallsFor(queries);
  deps.print(
    `seed:places ${target.city.slug} / ${target.dish.slug} (${target.dish.name}; category ` +
      `${target.dish.categorySlug}; includedType ${queries[0]?.params.includedType ?? "(none)"})`,
  );
  deps.print(
    `areas: ${queries.length} · max calls: ${maxCalls} (${queries.length} areas × ` +
      `${TEXT_SEARCH.maxPages} pages, before retries) · budget --max-calls: ${cli.maxCalls}`,
  );

  if (cli.dryRun) {
    deps.print(
      "DRY RUN: no Google calls. Planned queries (each limited to a rectangle around the area):",
    );
    for (const q of queries) {
      const { low, high } = q.params.restriction;
      deps.print(
        `  ${q.areaSlug.padEnd(18)} "${q.params.textQuery}"  box ${low.lat},${low.lng} → ${high.lat},${high.lng}`,
      );
    }
    deps.print(
      `A full live import of this dish (every page of every area) takes at most ${maxCalls} Text Search Pro calls.`,
    );
    return 0;
  }

  const client = deps.createClient(cli.maxCalls);
  if (!client) {
    deps.printError(
      "seed:places: GOOGLE_PLACES_API_KEY is not set. Add it to your env file (see .env.example); --dry-run works without it.",
    );
    return 1;
  }
  const run = await runPlanningQueries(client, queries, (area) => {
    deps.print(
      `  ${area.areaSlug.padEnd(18)} ${area.pages} pages  ${String(area.results).padStart(3)} results  ` +
        `${String(area.newPlaces).padStart(3)} new${area.error ? `  (error: ${area.error})` : ""}`,
    );
  });
  if (run.stoppedEarly) {
    deps.printError(
      `stopped early: ${run.stoppedEarly}. Not searched: ${run.notSearched.join(", ") || "none"}.`,
    );
  }
  const proCalls = run.areas.reduce((sum, a) => sum + a.pages, 0);
  deps.print(
    `unique places: ${run.uniquePlaces} · calls used: ${run.calls} of ${cli.maxCalls} ` +
      "(Text Search Essentials IDs Only: no charge)",
  );
  deps.print(
    `live import estimate: ${proCalls} Text Search Pro calls to load every page of these areas in /admin/import.`,
  );
  deps.print(
    "No file written: this tool never fetches names or addresses. Import with the live search in /admin/import.",
  );
  return run.stoppedEarly ? 1 : 0;
}
