// Google data age rules (CLAUDE.md rule 2, docs/07 §2 and §5). googleSyncedAt is always the time of
// the Google call behind lat/lng (the search response on Create/Link, or a refresh), never the
// import time.
import { z } from "zod";

export const PLACES_POLICY = {
  /** Google lat/lng may be kept at most 30 days (Places Service Specific Terms). */
  maxAgeDays: 30,
  /**
   * Create and Link accept a search result at most this old (a live result is minutes old), so
   * coordinates saved even from a stale page are refreshed long before the 30-day limit.
   */
  // DECISION-PENDING: 24 hours.
  maxSaveAgeHours: 24,
  /** refresh-places selects rows whose googleSyncedAt is NULL or older than this. */
  refreshAfterDays: 25,
  /** A failed refresh (other than NOT_FOUND) nulls lat/lng once the row is this old. */
  nullOnFailureAfterDays: 28,
  /** Catch-up after missed runs: rows older than this are nulled before anything else. */
  catchUpAfterDays: 29,
  /** Clock skew allowed for a fetchedAt in the future. */
  futureToleranceMinutes: 10,
} as const;

const DAY_MS = 86_400_000;

export function ageInDays(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / DAY_MS;
}

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export type FetchedAtCheck =
  { ok: true; fetchedAt: Date; ageDays: number } | { ok: false; reason: string };

const isoDateTime = z.iso.datetime({ offset: true });

/** docs/07 §2: a missing, unparseable, future or older-than-24-hours fetchedAt cannot be saved. */
export function checkFetchedAt(value: string | null | undefined, now: Date): FetchedAtCheck {
  if (!value || !value.trim()) return { ok: false, reason: "fetchedAt is missing" };
  if (!isoDateTime.safeParse(value.trim()).success) {
    return { ok: false, reason: "fetchedAt is not an ISO date-time" };
  }
  const fetchedAt = new Date(value.trim());
  const ageDays = ageInDays(fetchedAt, now);
  if (ageDays * 24 * 60 < -PLACES_POLICY.futureToleranceMinutes) {
    return { ok: false, reason: "fetchedAt is in the future" };
  }
  if (ageDays * 24 > PLACES_POLICY.maxSaveAgeHours) {
    const age = ageDays >= 2 ? `${Math.floor(ageDays)} days` : `${Math.floor(ageDays * 24)} hours`;
    return {
      ok: false,
      reason: `Fetched ${age} ago: Google data older than ${PLACES_POLICY.maxSaveAgeHours} hours cannot be saved. Search again in /admin/import.`,
    };
  }
  return { ok: true, fetchedAt, ageDays };
}
