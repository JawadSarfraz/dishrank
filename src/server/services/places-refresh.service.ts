// Places coordinate refresh (docs/07 §5), run daily by /api/cron/refresh-places. Keeps Google
// lat/lng under 30 days old (CLAUDE.md rule 2): refresh after 25 days; NOT_FOUND, or any failure
// once a row is 28+ days old, nulls lat/lng and opens one PLACE_REFRESH_FAILED review item.
import { PlacesApiError, type PlaceDetailsResult, type PlacesClient } from "@/server/places";
import { logEvent } from "@/server/log";
import {
  createReviewItem,
  findOpenReviewItem,
  resolveOpenReviewItems,
} from "@/server/repositories/moderation.repo";
import { finishJobRun, startJobRun } from "@/server/repositories/ops.repo";
import {
  listGoogleCoordinatesSyncedBefore,
  listRestaurantsDueForRefresh,
  updateRestaurantById,
} from "@/server/repositories/restaurant.repo";
import { PLACES_POLICY, ageInDays, daysBefore } from "./places-policy";

export const REFRESH_JOB = "refresh-places";

/** Stop before the 250 s budget, keeping room for one slow call (3 attempts with backoff). */
export const REFRESH_TIME = { budgetMs: 250_000, reserveMs: 15_000 } as const;

export type RefreshSummary = {
  /** Rows due for a refresh (googlePlaceId and googleSyncedAt NULL or older than 25 days). */
  selected: number;
  /** HTTP requests sent to Place Details, retries included. */
  calls: number;
  ok: number;
  notFound: number;
  errors: number;
  /** Rows whose lat/lng were set to NULL (catch-up, NOT_FOUND, failure at 28+ days). */
  nulled: number;
  /** Of those, rows nulled by the 29-day catch-up before anything else. */
  caughtUp: number;
  reviewItems: number;
  resolvedReviewItems: number;
  skippedForTime: number;
  error?: string;
};

type RefreshRow = {
  id: string;
  googlePlaceId: string | null;
  googleSyncedAt: Date | null;
  lat: number | null;
  lng: number | null;
};

export type RefreshDeps = {
  /** Place Details client, or null when GOOGLE_PLACES_API_KEY is missing (every due row then fails). */
  places: Pick<PlacesClient, "placeDetails" | "calls"> | null;
  /** The job's clock (tests pass a fake one). */
  now?: () => Date;
  /** Wall-clock milliseconds for the time budget. */
  elapsedMs?: () => number;
};

/** One OPEN item per restaurant (docs/07 §5 step 5). Returns true when a new item was created. */
async function openRefreshItem(row: RefreshRow, error: string): Promise<boolean> {
  if (await findOpenReviewItem("PLACE_REFRESH_FAILED", row.id)) return false;
  await createReviewItem({
    type: "PLACE_REFRESH_FAILED",
    restaurantId: row.id,
    payload: {
      restaurantId: row.id,
      googlePlaceId: row.googlePlaceId,
      error,
      googleSyncedAt: row.googleSyncedAt?.toISOString() ?? null,
    },
  });
  return true;
}

async function nullCoordinates(row: RefreshRow): Promise<boolean> {
  if (row.lat === null && row.lng === null) return false;
  await updateRestaurantById(row.id, { lat: null, lng: null });
  row.lat = null;
  row.lng = null;
  return true;
}

export async function refreshPlaces(deps: RefreshDeps) {
  const now = deps.now ?? (() => new Date());
  const startedMs = Date.now();
  const elapsedMs = deps.elapsedMs ?? (() => Date.now() - startedMs);
  const startedAt = now();
  const job = await startJobRun(REFRESH_JOB, startedAt);
  const summary: RefreshSummary = {
    selected: 0,
    calls: 0,
    ok: 0,
    notFound: 0,
    errors: 0,
    nulled: 0,
    caughtUp: 0,
    reviewItems: 0,
    resolvedReviewItems: 0,
    skippedForTime: 0,
  };

  try {
    // 1. Catch-up after missed runs: nothing older than 29 days keeps its coordinates.
    const stale = await listGoogleCoordinatesSyncedBefore(
      daysBefore(startedAt, PLACES_POLICY.catchUpAfterDays),
    );
    for (const row of stale) {
      if (await nullCoordinates(row)) {
        summary.nulled++;
        summary.caughtUp++;
      }
      if (await openRefreshItem(row, "Coordinates older than 29 days (missed refresh runs)")) {
        summary.reviewItems++;
      }
    }

    // 2-4. Refresh due rows, oldest first, within the time budget.
    const due = await listRestaurantsDueForRefresh(
      daysBefore(startedAt, PLACES_POLICY.refreshAfterDays),
    );
    summary.selected = due.length;
    for (const [index, row] of due.entries()) {
      if (elapsedMs() >= REFRESH_TIME.budgetMs - REFRESH_TIME.reserveMs) {
        summary.skippedForTime = due.length - index;
        break;
      }
      let result: PlaceDetailsResult | { kind: "error"; error: string };
      if (!deps.places) {
        result = { kind: "error", error: "GOOGLE_PLACES_API_KEY is not set" };
      } else {
        try {
          result = await deps.places.placeDetails(row.googlePlaceId!);
        } catch (error) {
          if (!(error instanceof PlacesApiError)) throw error;
          result = { kind: "error", error: error.describe() };
        }
      }

      if (result.kind === "ok") {
        await updateRestaurantById(row.id, {
          lat: result.lat,
          lng: result.lng,
          googleSyncedAt: result.fetchedAt,
        });
        summary.ok++;
        const resolved = await resolveOpenReviewItems(
          "PLACE_REFRESH_FAILED",
          row.id,
          "Resolved automatically: the location refresh succeeded",
          now(),
        );
        summary.resolvedReviewItems += resolved.count;
        continue;
      }

      if (result.kind === "not_found") {
        // The place id is obsolete: null at once.
        summary.notFound++;
        if (await nullCoordinates(row)) summary.nulled++;
        if (await openRefreshItem(row, `NOT_FOUND: ${result.message}`)) summary.reviewItems++;
        continue;
      }

      // Any other error: keep the coordinates for the next run unless they are 28+ days old
      // (a NULL googleSyncedAt has unknown age and counts as old).
      summary.errors++;
      logEvent("places.refresh.error", { restaurantId: row.id, error: result.error }, "warn");
      const age = row.googleSyncedAt ? ageInDays(row.googleSyncedAt, startedAt) : Infinity;
      if (age >= PLACES_POLICY.nullOnFailureAfterDays) {
        if (await nullCoordinates(row)) summary.nulled++;
        if (await openRefreshItem(row, result.error)) summary.reviewItems++;
      }
    }

    summary.calls = deps.places?.calls ?? 0;
    const missingKey = !deps.places && summary.selected > summary.skippedForTime;
    if (missingKey) summary.error = "GOOGLE_PLACES_API_KEY is not set";
    const ok = !missingKey;
    await finishJobRun(job.id, { ok, summary, finishedAt: now() });
    logEvent("places.refresh", { jobRunId: job.id, jobOk: ok, ...summary });
    return { ok, jobRunId: job.id, summary };
  } catch (error) {
    summary.calls = deps.places?.calls ?? 0;
    summary.error = error instanceof Error ? error.message : String(error);
    await finishJobRun(job.id, { ok: false, summary, finishedAt: now() });
    logEvent("places.refresh.failed", { jobRunId: job.id, ...summary }, "error");
    throw error;
  }
}
