// The nightly recompute (docs/04 recomputeAll). /api/cron/recompute-rankings (02:00 PKT),
// `pnpm rankings:recompute` and "Recompute now" on /admin/rankings all run recomputeAll; the
// manual /api/cron/mark-stale runs only steps 4 and 5. Every run writes one JobRun.
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS } from "@/server/rate-limit";
import { listCityLaunches } from "@/server/repositories/geo.repo";
import {
  insertRankingSnapshot,
  listAllCityDishLists,
  listLatestSnapshots,
  listRowsToRecompute,
  listTopRanked,
  markStaleRowsOfList,
  startExclusiveJobRun,
  upsertDishStats,
} from "@/server/repositories/nightly.repo";
import { deleteRateLimitBucketsBefore, finishJobRun } from "@/server/repositories/ops.repo";
import { lockCityDish } from "@/server/repositories/ranking.repo";
import { inTransaction } from "@/server/repositories/transaction";
import {
  findRater,
  findTrustStats,
  listTrustSnapshot,
  lockUser,
  updateUserById,
} from "@/server/repositories/user.repo";
import { DAY_MS, RANKING } from "./ranking.constants";
import { recomputeOne, rerankList, thresholdsFor, trustFor } from "./ranking.service";

export const RECOMPUTE_JOB = "recompute-rankings";
export const MARK_STALE_JOB = "mark-stale";
/** An unfinished run older than this is taken as dead (the function timed out or crashed). */
const RUN_TIMEOUT_MS = 30 * 60_000;

export type RecomputeTrigger = "cron" | "cli" | "admin";

export type RecomputeSummary = {
  trigger: RecomputeTrigger;
  trust: { users: number; changed: number };
  dishStats: number;
  rows: { recomputed: number; promoted: number; failed: number };
  stale: number;
  lists: number;
  snapshots: number;
  rateLimitBuckets: number;
  durationMs: number;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function startJob(name: string, now: Date) {
  const job = await startExclusiveJobRun(name, now, RUN_TIMEOUT_MS);
  if (!job) throw new AppError("JOB_RUNNING", "This job is already running. Try again later.", 409);
  return job;
}

/**
 * Step 1: trust from the docs/04 table for every user who is not on the panel or banned. One scan
 * finds whose trust would change; each of those is re-checked and written under the user's row
 * lock, so a panel toggle or an admin decision made meanwhile is never overwritten.
 */
async function recomputeTrust() {
  const users = await listTrustSnapshot();
  let changed = 0;
  for (const u of users) {
    const expected = trustFor({
      isPanel: false,
      activeRatings: u.activeRatings,
      activePhotoRatings: u.activePhotoRatings,
      hiddenRatings: u.hiddenRatings,
      upheldFlags: 0,
      recentRatings: u.recentRatings ?? [],
    });
    if (expected === u.trustScore) continue;
    const wrote = await inTransaction(async (tx) => {
      await lockUser(u.id, tx);
      const rater = await findRater(u.id, tx);
      const stats = await findTrustStats(u.id, tx);
      if (!rater || !stats || rater.isPanel || rater.bannedAt) return false;
      const trustScore = trustFor(stats);
      if (trustScore === rater.trustScore) return false;
      await updateUserById(u.id, { trustScore }, tx);
      return true;
    });
    if (wrote) changed++;
  }
  return { users: users.length, changed };
}

/**
 * Steps 4 and 5, one list at a time under its lock: rows without a rating or verification for 270
 * days (365 for menu- and owner-verified rows) become STALE, then the list is re-ranked with its
 * city's thresholds, so a row that just went stale loses its rank.
 */
export async function markStaleAndRerank(now: Date) {
  const lists = await listAllCityDishLists();
  const launches = new Map((await listCityLaunches()).map((c) => [c.id, c.launchedAt]));
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
  let stale = 0;
  for (const list of lists) {
    stale += await inTransaction(async (tx) => {
      await lockCityDish(list.cityId, list.dishId, tx);
      const marked = await markStaleRowsOfList(
        {
          ...list,
          now,
          unverifiedBefore: before(RANKING.staleDays.unverified),
          verifiedBefore: before(RANKING.staleDays.verified),
        },
        tx,
      );
      const t = thresholdsFor(launches.get(list.cityId) ?? null, now);
      await rerankList(list.cityId, list.dishId, t, tx);
      return marked;
    });
  }
  return { stale, lists: lists.length };
}

const isSundayInPakistan = (now: Date) =>
  new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "Asia/Karachi" }).format(now) ===
  "Sun";

/**
 * Step 6: on Sundays (Pakistan time), the top 50 of every list that ranks a restaurant. A list
 * whose last snapshot is more than 7 days old catches up on the next run; a second run on the same
 * day writes nothing.
 */
async function writeWeeklySnapshots(now: Date) {
  const sunday = isSundayInPakistan(now);
  const latest = new Map(
    (await listLatestSnapshots()).map((s) => [`${s.cityId}:${s.dishId}`, s.computedAt]),
  );
  let written = 0;
  for (const list of await listAllCityDishLists()) {
    const last = latest.get(`${list.cityId}:${list.dishId}`) ?? null;
    const age = last ? now.getTime() - last.getTime() : Infinity;
    const due = (sunday && age > DAY_MS) || (last !== null && age > 7 * DAY_MS);
    if (!due) continue;
    const top = await listTopRanked(list.cityId, list.dishId, RANKING.snapshotTop);
    if (top.length === 0) continue;
    await insertRankingSnapshot({
      ...list,
      computedAt: now,
      payload: top.map((r) => ({
        restaurantDishId: r.id,
        rank: r.rankInCity,
        score: r.score === null ? null : Number(r.score),
        votes: r.distinctRaters,
      })),
    });
    written++;
  }
  return written;
}

/** Buckets older than twice the longest rate-limit window can no longer count toward any limit. */
const BUCKET_KEEP_MS =
  2 * Math.max(...Object.values(RATE_LIMITS).map((r) => r.windowSeconds)) * 1000;

/**
 * docs/04 recomputeAll, steps in order: trust → DishStat → every rated row (decay at `now`) →
 * stale marking and re-rank per list → weekly snapshot → rate-limit cleanup. A row that fails is
 * logged and the run goes on (ok: false at the end); any other failure stops the run, which is
 * recorded in its JobRun and thrown (the next night retries). Refuses to start while another run
 * is going (409 JOB_RUNNING).
 */
export async function recomputeAll(options: { trigger: RecomputeTrigger; now?: Date }) {
  const now = options.now ?? new Date();
  const started = Date.now();
  const job = await startJob(RECOMPUTE_JOB, now);
  const summary: RecomputeSummary = {
    trigger: options.trigger,
    trust: { users: 0, changed: 0 },
    dishStats: 0,
    rows: { recomputed: 0, promoted: 0, failed: 0 },
    stale: 0,
    lists: 0,
    snapshots: 0,
    rateLimitBuckets: 0,
    durationMs: 0,
  };
  try {
    summary.trust = await recomputeTrust();
    summary.dishStats = await upsertDishStats(now, RANKING.halfLifeDays);
    for (const id of await listRowsToRecompute()) {
      try {
        // Each list is re-ranked once below, after all its rows.
        const result = await recomputeOne(id, now, { rerank: false });
        summary.rows.recomputed++;
        if (result?.promoted) summary.rows.promoted++;
      } catch (error) {
        summary.rows.failed++;
        logEvent("ranking.recompute_failed", { entityId: id, error: message(error) }, "error");
      }
    }
    const lists = await markStaleAndRerank(now);
    summary.stale = lists.stale;
    summary.lists = lists.lists;
    summary.snapshots = await writeWeeklySnapshots(now);
    summary.rateLimitBuckets = await deleteRateLimitBucketsBefore(
      new Date(now.getTime() - BUCKET_KEEP_MS),
    );
  } catch (error) {
    summary.durationMs = Date.now() - started;
    await finishJobRun(job.id, {
      ok: false,
      summary: { ...summary, error: message(error) },
      finishedAt: new Date(),
    });
    logEvent("ranking.recompute_all", { ok: false, error: message(error), ...summary }, "error");
    throw error;
  }
  summary.durationMs = Date.now() - started;
  const ok = summary.rows.failed === 0;
  await finishJobRun(job.id, { ok, summary, finishedAt: new Date() });
  logEvent("ranking.recompute_all", { ok, ...summary }, ok ? "info" : "error");
  return { jobRunId: job.id, ok, summary };
}

/** /api/cron/mark-stale (manual runs only): steps 4 and 5 with their own JobRun. */
export async function markStaleAll(now: Date = new Date()) {
  const started = Date.now();
  const job = await startJob(MARK_STALE_JOB, now);
  try {
    const result = await markStaleAndRerank(now);
    const summary = { ...result, durationMs: Date.now() - started };
    await finishJobRun(job.id, { ok: true, summary, finishedAt: new Date() });
    logEvent("ranking.mark_stale", summary);
    return { jobRunId: job.id, ok: true, summary };
  } catch (error) {
    await finishJobRun(job.id, {
      ok: false,
      summary: { error: message(error) },
      finishedAt: new Date(),
    });
    throw error;
  }
}
