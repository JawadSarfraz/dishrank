// `pnpm overture:sync` (docs/07 §1): stage Overture Maps places as candidates for admin review.
// A newer release adds GERS ids not seen before and refreshes the data of NEW (unreviewed)
// candidates (name, address, phone, website, location, categories); a reviewed row (CREATED,
// LINKED, SKIPPED) only gets lastSeenRelease. Each sync also places every NEW candidate again with
// the current seed areas and radii. Nothing here creates or changes a restaurant.
import { listAreasWithCity } from "@/server/repositories/geo.repo";
import { finishJobRun, listSuccessfulJobRuns, startJobRun } from "@/server/repositories/ops.repo";
import {
  findCandidatesByOvertureIds,
  insertCandidates,
  listLocatedNewCandidates,
  refreshNewCandidate,
  setLastSeenRelease,
} from "@/server/repositories/overture.repo";
import { logEvent } from "@/server/log";
import { countDuplicatePairs } from "./overture/duplicates";
import {
  OVERTURE_RULES,
  RELEASE_PATTERN,
  buildCandidates,
  compareReleases,
  placeCandidate,
  type BuildStats,
  type CandidateDraft,
  type OverturePlace,
  type SeedArea,
} from "./overture/places";

export const OVERTURE_SYNC_JOB = "overture-sync";

export type CitySyncSummary = {
  /** Candidates of this city in the release. */
  inRelease: number;
  inserted: number;
  /** GERS ids already staged. */
  alreadyStaged: number;
  /** NEW candidates whose data this (newer) release changed. */
  refreshed: number;
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
  /** NEW candidates placed again with the current areas (docs/07 §1). */
  areas: AreaSummary;
};

/** Per city after placing NEW candidates again: how many have a suggested area. */
export type AreaSummary = Record<
  string,
  { located: number; withArea: number; withoutArea: number; changed: number }
>;

/** What a newer release writes on a NEW candidate (the fields the review form is prefilled from). */
function refreshedData(d: CandidateDraft) {
  return {
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
    cityId: d.cityId,
    suggestedAreaId: d.suggestedAreaId,
  };
}

const sameData = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.keys(b).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

/**
 * Places every NEW candidate with a location of these cities again (city and suggested area) with
 * the seed areas as they are now, e.g. after an area got its own radius. A row an admin reviewed
 * meanwhile is never changed. `pnpm overture:sync -- --areas-only` runs only this.
 */
export async function placeNewCandidates(
  citySlugs: readonly string[],
  areas: readonly SeedArea[],
  marginKm: number,
): Promise<AreaSummary> {
  const cityIds = new Map(areas.map((a) => [a.citySlug, a.cityId]));
  const ids = citySlugs.map((slug) => cityIds.get(slug)).filter((id): id is string => !!id);
  const summary: AreaSummary = Object.fromEntries(
    citySlugs.map((slug) => [slug, { located: 0, withArea: 0, withoutArea: 0, changed: 0 }]),
  );
  const slugOf = new Map(areas.map((a) => [a.cityId, a.citySlug]));
  for (const c of await listLocatedNewCandidates(ids)) {
    const place = placeCandidate({ lat: c.lat!, lng: c.lng! }, areas, marginKm);
    // Beyond the margin now (a seed area moved): keep the city, no suggestion.
    const next = place
      ? { cityId: place.cityId, suggestedAreaId: place.suggestedAreaId }
      : { cityId: c.cityId, suggestedAreaId: null };
    if (next.cityId !== c.cityId || next.suggestedAreaId !== c.suggestedAreaId) {
      const written = await refreshNewCandidate(c.id, next);
      if (written) summary[slugOf.get(c.cityId)!]!.changed++;
    }
    const s = summary[slugOf.get(next.cityId)!];
    if (!s) continue; // moved to a city this run does not report
    s.located++;
    if (next.suggestedAreaId) s.withArea++;
    else s.withoutArea++;
  }
  return summary;
}

/** `pnpm overture:sync -- --areas-only`: place NEW candidates again, no download (JobRun). */
export async function replaceAreaSuggestions(input: {
  citySlugs: readonly string[];
  marginKm?: number;
  now?: Date;
}) {
  const job = await startJobRun(`${OVERTURE_SYNC_JOB}-areas`, input.now ?? new Date());
  try {
    const areas = await listAreasWithCity();
    const unknown = input.citySlugs.filter((slug) => !areas.some((a) => a.citySlug === slug));
    if (unknown.length > 0) throw new Error(`unknown city: ${unknown.join(", ")}`);
    const summary = await placeNewCandidates(
      input.citySlugs,
      areas,
      input.marginKm ?? OVERTURE_RULES.marginKm,
    );
    await finishJobRun(job.id, { ok: true, summary, finishedAt: new Date() });
    logEvent("overture.areas", { cities: summary });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishJobRun(job.id, { ok: false, summary: { error: message }, finishedAt: new Date() });
    throw error;
  }
}

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
    const summary: SyncSummary = {
      release: input.release,
      marginKm,
      cities: {},
      filters: stats,
      areas: {},
    };
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
      // A newer release refreshes NEW candidates whose data changed; reviewed rows keep theirs.
      const draftOf = new Map(city.map((d) => [d.overtureId, d]));
      let refreshed = 0;
      for (const e of older) {
        const draft = draftOf.get(e.overtureId);
        if (e.status !== "NEW" || !draft) continue;
        const data = refreshedData(draft);
        if (sameData(e, data)) continue;
        refreshed += await refreshNewCandidate(e.id, { ...data, release: input.release });
      }
      summary.cities[citySlug] = {
        inRelease: city.length,
        inserted,
        alreadyStaged: existing.length,
        refreshed,
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
    summary.areas = await placeNewCandidates(input.citySlugs, areas, marginKm);
    await finishJobRun(job.id, { ok: true, summary, finishedAt: new Date() });
    logEvent("overture.sync", {
      release: input.release,
      cities: Object.fromEntries(
        Object.entries(summary.cities).map(([slug, c]) => [
          slug,
          { inserted: c.inserted, refreshed: c.refreshed },
        ]),
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
