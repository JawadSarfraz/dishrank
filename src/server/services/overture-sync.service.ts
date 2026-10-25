// `pnpm overture:sync` (docs/07 §1): stage Overture Maps places as candidates for admin review.
// A later release only adds GERS ids not seen before; existing rows keep their data and review
// state, only lastSeenRelease moves forward. Nothing here creates or changes a restaurant.
import { listAreasWithCity } from "@/server/repositories/geo.repo";
import { finishJobRun, listSuccessfulJobRuns, startJobRun } from "@/server/repositories/ops.repo";
import {
  findCandidatesByOvertureIds,
  insertCandidates,
  setLastSeenRelease,
} from "@/server/repositories/overture.repo";
import { logEvent } from "@/server/log";
import { countDuplicatePairs } from "./overture/duplicates";
import {
  OVERTURE_RULES,
  RELEASE_PATTERN,
  buildCandidates,
  compareReleases,
  type BuildStats,
  type OverturePlace,
} from "./overture/places";

export const OVERTURE_SYNC_JOB = "overture-sync";

export type CitySyncSummary = {
  /** Candidates of this city in the release. */
  inRelease: number;
  inserted: number;
  /** GERS ids already staged: left as they are. */
  alreadyStaged: number;
  lastSeenUpdated: number;
  withArea: number;
  withoutArea: number;
  locationUnknown: number;
  /** Pairs of candidates within 50 m with similar names (both are kept; the review page flags them). */
  likelyDuplicatePairs: number;
};

export type SyncSummary = {
  release: string;
  marginKm: number;
  cities: Record<string, CitySyncSummary>;
  filters: BuildStats;
};

export async function syncOvertureCandidates(input: {
  places: readonly OverturePlace[];
  release: string;
  citySlugs: readonly string[];
  marginKm?: number;
  now?: Date;
}): Promise<SyncSummary> {
  if (!RELEASE_PATTERN.test(input.release)) throw new Error(`bad release: ${input.release}`);
  const marginKm = input.marginKm ?? OVERTURE_RULES.marginKm;
  const started = Date.now();
  const job = await startJobRun(OVERTURE_SYNC_JOB, input.now ?? new Date());
  try {
    const areas = await listAreasWithCity();
    const known = new Set(areas.map((a) => a.citySlug));
    const unknown = input.citySlugs.filter((slug) => !known.has(slug));
    if (unknown.length > 0) throw new Error(`unknown city: ${unknown.join(", ")}`);

    const { drafts, stats } = buildCandidates(input.places, areas, marginKm);
    const summary: SyncSummary = { release: input.release, marginKm, cities: {}, filters: stats };
    for (const citySlug of input.citySlugs) {
      const city = drafts.filter((d) => d.citySlug === citySlug);
      const existing = await findCandidatesByOvertureIds(city.map((d) => d.overtureId));
      const staged = new Set(existing.map((e) => e.overtureId));
      const inserted = await insertCandidates(
        city
          .filter((d) => !staged.has(d.overtureId))
          .map((d) => ({
            overtureId: d.overtureId,
            release: input.release,
            lastSeenRelease: input.release,
            cityId: d.cityId,
            suggestedAreaId: d.suggestedAreaId,
            name: d.name,
            address: d.address,
            phone: d.phone,
            website: d.website,
            category: d.category,
            alternates: d.alternates,
            confidence: d.confidence,
            lat: d.lat,
            lng: d.lng,
            sources: d.sources,
          })),
      );
      const older = existing.filter((e) => compareReleases(e.lastSeenRelease, input.release) < 0);
      summary.cities[citySlug] = {
        inRelease: city.length,
        inserted,
        alreadyStaged: existing.length,
        lastSeenUpdated: await setLastSeenRelease(
          older.map((e) => e.id),
          input.release,
        ),
        withArea: city.filter((d) => d.suggestedAreaId !== null).length,
        withoutArea: city.filter((d) => d.suggestedAreaId === null && d.lat !== null).length,
        locationUnknown: city.filter((d) => d.lat === null).length,
        likelyDuplicatePairs: countDuplicatePairs(city.map((d) => ({ ...d, id: d.overtureId }))),
      };
    }
    await finishJobRun(job.id, { ok: true, summary, finishedAt: new Date() });
    logEvent("overture.sync", {
      release: input.release,
      cities: Object.fromEntries(
        Object.entries(summary.cities).map(([slug, c]) => [slug, { inserted: c.inserted }]),
      ),
      durationMs: Date.now() - started,
    });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishJobRun(job.id, { ok: false, summary: { error: message }, finishedAt: new Date() });
    throw error;
  }
}

/** The newest successfully synced release and the day it was first synced (Asia/Karachi). */
export async function latestOvertureSync(): Promise<{
  release: string;
  firstSyncedOn: string;
} | null> {
  const runs = await listSuccessfulJobRuns(OVERTURE_SYNC_JOB);
  let latest: { release: string; firstSyncedOn: string } | null = null;
  for (const run of runs) {
    const release = (run.summary as { release?: unknown } | null)?.release;
    if (typeof release !== "string" || !RELEASE_PATTERN.test(release)) continue;
    // Runs are oldest first, so the first run of a newer release sets its date.
    if (!latest || compareReleases(release, latest.release) > 0) {
      latest = { release, firstSyncedOn: karachiDate(run.startedAt) };
    }
  }
  return latest;
}

/** YYYY-MM-DD in Asia/Karachi. */
export function karachiDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(at);
}
