// pnpm seed:places -- --city=islamabad --dish=chicken-karahi [--areas=f-7,f-8] [--dry-run] [--max-calls=150]
// Google Places Text Search → tmp/candidates-<city>-<dish>-<yyyy-mm-dd>.csv (docs/07 §1).
// Reads the city, areas and dish from the DB and never writes to it; import happens in /admin/import.
import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { env } from "@/env";
import { isSlug } from "@/lib/slug";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { TEXT_SEARCH, createPlacesClient } from "@/server/places";
import { encodeCandidatesCsv } from "@/server/services/candidates-csv";
import {
  loadSeedTarget,
  maxCallsFor,
  planSeedQueries,
  runSeedQueries,
} from "@/server/services/places-seed";

const USAGE =
  "Usage: pnpm seed:places -- --city=<city> --dish=<dish> [--areas=<a,b>] [--dry-run] [--max-calls=<n>]";
const DEFAULT_MAX_CALLS = 150;

class UsageError extends Error {}

function parseCli(argv: string[]) {
  const args = argv[0] === "--" ? argv.slice(1) : argv; // `pnpm run x -- …` may pass the "--" on
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

function outputPath(city: string, dish: string, date: string): string {
  const dir = path.join(process.cwd(), "tmp");
  mkdirSync(dir, { recursive: true });
  const base = `candidates-${city}-${dish}-${date}`;
  let file = path.join(dir, `${base}.csv`);
  for (let n = 2; existsSync(file); n++) file = path.join(dir, `${base}-${n}.csv`); // never overwrite a paid run
  return file;
}

async function main(): Promise<number> {
  const cli = parseCli(process.argv.slice(2));
  const target = await loadSeedTarget({
    citySlug: cli.city,
    dishSlug: cli.dish,
    areaSlugs: cli.areas,
  });
  const queries = planSeedQueries(target);
  const maxCalls = maxCallsFor(queries);
  const includedType = queries[0]?.params.includedType ?? "(none)";

  console.log(
    `seed:places ${target.city.slug} / ${target.dish.slug} (${target.dish.name}; category ` +
      `${target.dish.categorySlug}; includedType ${includedType})`,
  );
  console.log(
    `areas: ${queries.length} · max calls: ${maxCalls} (${queries.length} areas × ${TEXT_SEARCH.maxPages} pages, ` +
      `before retries) · budget --max-calls: ${cli.maxCalls}`,
  );
  if (maxCalls > cli.maxCalls) {
    console.log(
      `note: the run stops before going over ${cli.maxCalls} calls; later areas are skipped.`,
    );
  }

  if (cli.dryRun) {
    console.log("DRY RUN: no Google calls, no file written. Planned queries:");
    for (const q of queries) {
      const { latitude, longitude } = q.params.center;
      console.log(
        `  ${q.areaSlug.padEnd(18)} "${q.params.textQuery}"  center ${latitude},${longitude}  ` +
          `radius ${TEXT_SEARCH.radiusMeters} m`,
      );
    }
    return 0;
  }

  if (!env.GOOGLE_PLACES_API_KEY) {
    console.error(
      "seed:places: GOOGLE_PLACES_API_KEY is not set. Add it to .env (see .env.example); --dry-run works without it.",
    );
    return 1;
  }

  const client = createPlacesClient({ apiKey: env.GOOGLE_PLACES_API_KEY, maxCalls: cli.maxCalls });
  const run = await runSeedQueries(client, queries, target.dish.slug, (area) => {
    const extra = [
      area.withoutLocation ? `${area.withoutLocation} without location` : "",
      area.error ? `error: ${area.error}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(
      `  ${area.areaSlug.padEnd(18)} ${area.pages} pages  ${String(area.results).padStart(3)} results  ` +
        `${String(area.newPlaces).padStart(3)} new${extra ? `  (${extra})` : ""}`,
    );
  });

  if (run.stoppedEarly) {
    console.warn(
      `stopped early: ${run.stoppedEarly}. Not searched: ${run.notSearched.join(", ") || "none"}.`,
    );
  }
  console.log(
    `unique places: ${run.rows.length} · calls used: ${run.calls} of ${cli.maxCalls} ` +
      `(each one a billable Text Search Pro request)`,
  );
  if (run.rows.length === 0) {
    console.log("no rows: nothing written.");
    return run.stoppedEarly ? 1 : 0;
  }
  const file = outputPath(
    target.city.slug,
    target.dish.slug,
    new Date().toISOString().slice(0, 10),
  );
  writeFileSync(file, encodeCandidatesCsv(run.rows), "utf8");
  console.log(
    `wrote ${path.relative(process.cwd(), file)} (import it at /admin/import within 30 days)`,
  );
  return run.stoppedEarly ? 1 : 0;
}

main()
  .then(async (code) => {
    await db.$disconnect();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    await db.$disconnect();
    if (error instanceof UsageError) console.error(`seed:places: ${error.message}\n${USAGE}`);
    else if (error instanceof AppError) console.error(`seed:places: ${error.message}`);
    else console.error("seed:places failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
