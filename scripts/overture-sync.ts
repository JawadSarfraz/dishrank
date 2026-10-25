// pnpm overture:sync -- --city=islamabad|rawalpindi|all [--release=latest] [--margin-km=5] [--refresh]
// Stages Overture Maps food and drink places (Meta and Microsoft records only) as candidates for
// /admin/import (docs/07 §1). Downloads the release once into tmp/overture/ (DuckDB, Overture's
// public S3 bucket), then writes only the OvertureCandidate table: never a restaurant, never Google.
import "dotenv/config";
import areas from "../seed/areas.json";
import { db } from "@/server/db";
import { OVERTURE_RULES, RELEASE_PATTERN } from "@/server/services/overture/places";
import { syncOvertureCandidates } from "@/server/services/overture-sync.service";
import {
  argValue,
  downloadPlaces,
  latestRelease,
  openDuckDb,
  readOverturePlaces,
  seedBox,
} from "./lib/overture";

const USAGE =
  "usage: pnpm overture:sync -- --city=islamabad|rawalpindi|all [--release=latest] [--margin-km=5] [--refresh]";
const KNOWN_FLAGS = ["city", "release", "margin-km", "refresh"];
const CITIES = [...new Set(areas.map((a) => a.city))].sort();

async function main(argv: readonly string[]): Promise<number> {
  const unknown = argv.filter(
    (a) => a !== "--" && !KNOWN_FLAGS.some((f) => a === `--${f}` || a.startsWith(`--${f}=`)),
  );
  const city = argValue(argv, "city");
  if (unknown.length > 0 || !city) {
    console.error(unknown.length > 0 ? `unknown argument: ${unknown.join(" ")}` : USAGE);
    if (unknown.length > 0) console.error(USAGE);
    return 1;
  }
  const citySlugs = city === "all" ? CITIES : [city];
  if (!citySlugs.every((slug) => CITIES.includes(slug))) {
    console.error(`unknown city "${city}" (${[...CITIES, "all"].join(", ")})`);
    return 1;
  }
  const releaseArg = argValue(argv, "release") ?? "latest";
  const release = releaseArg === "latest" ? await latestRelease() : releaseArg;
  if (!RELEASE_PATTERN.test(release)) {
    console.error(`bad --release "${releaseArg}" (e.g. 2026-10-21.0 or latest)`);
    return 1;
  }
  const marginKm = Number(argValue(argv, "margin-km") ?? OVERTURE_RULES.marginKm);
  if (!Number.isFinite(marginKm) || marginKm <= 0 || marginKm > 20) {
    console.error(`bad --margin-km "${argValue(argv, "margin-km")}" (0 < km ≤ 20)`);
    return 1;
  }

  const c = await openDuckDb();
  const t0 = Date.now();
  const { file, downloaded } = await downloadPlaces(
    c,
    release,
    seedBox(areas, marginKm),
    argValue(argv, "refresh") === "true",
  );
  console.log(
    `release ${release}: ${downloaded ? `downloaded in ${Math.round((Date.now() - t0) / 1000)} s` : "cached"} (${file})`,
  );
  const places = await readOverturePlaces(c, file);
  const summary = await syncOvertureCandidates({ places, release, citySlugs, marginKm });

  const f = summary.filters;
  const dropped = Object.entries(f.otherSources)
    .map(([dataset, n]) => `${dataset} ${n}`)
    .join(", ");
  console.log(
    `places in the box ${f.places}; food and drink ${f.food}; kept ${f.kept} (left out: ` +
      `${dropped || "no other sources"}, no name ${f.noName}, permanently closed ${f.closed}, ` +
      `more than ${marginKm} km from every seed area ${f.outside}); location unknown ` +
      `(placeholder points) ${f.locationUnknown}; Google links removed from ${f.googleLinksRemoved}.`,
  );
  for (const [slug, s] of Object.entries(summary.cities)) {
    console.log(
      `${slug}: ${s.inRelease} candidates in this release, ${s.inserted} new, ` +
        `${s.alreadyStaged} already staged (unchanged; ${s.lastSeenUpdated} marked as still in this release); ` +
        `${s.withArea} with a suggested area, ${s.withoutArea} without, ${s.locationUnknown} location unknown; ` +
        `${s.likelyDuplicatePairs} likely duplicate pairs (flagged on /admin/import).`,
    );
  }
  return 0;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error("overture:sync failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
