// Google data age rules (CLAUDE.md rule 2, docs/07 §2 and §5). googleSyncedAt is always the time of
// the Google call behind lat/lng (CSV fetchedAt or a refresh), never the import time.
import { z } from "zod";

export const PLACES_POLICY = {
  /** Google lat/lng may be kept at most 30 days; older CSV rows cannot be imported. */
  maxAgeDays: 30,
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

/** docs/07 §2: a missing, unparseable, future or older-than-30-days fetchedAt cannot be imported. */
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
  if (ageDays > PLACES_POLICY.maxAgeDays) {
    return {
      ok: false,
      reason: `Fetched ${Math.floor(ageDays)} days ago: Google data older than ${PLACES_POLICY.maxAgeDays} days cannot be imported. Run pnpm seed:places again.`,
    };
  }
  return { ok: true, fetchedAt, ageDays };
}
