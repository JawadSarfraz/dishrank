// Job runs and rate-limit buckets.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export async function startJobRun(name: string, startedAt: Date) {
  return db.jobRun.create({ data: { name, startedAt }, select: { id: true } });
}

/** Every run of one job, oldest first. */
export async function listJobRuns(name: string) {
  return db.jobRun.findMany({
    where: { name },
    orderBy: { startedAt: "asc" },
    select: { id: true, startedAt: true, ok: true, summary: true },
  });
}

/** The latest runs of one job, newest first (/admin/rankings). */
export async function listRecentJobRuns(name: string, take: number) {
  return db.jobRun.findMany({
    where: { name },
    orderBy: { startedAt: "desc" },
    take,
    select: { id: true, startedAt: true, finishedAt: true, ok: true, summary: true },
  });
}

/** Successful runs of one job, oldest first. */
export async function listSuccessfulJobRuns(name: string) {
  return db.jobRun.findMany({
    where: { name, ok: true },
    orderBy: { startedAt: "asc" },
    select: { startedAt: true, summary: true },
  });
}

export async function finishJobRun(
  id: string,
  data: { ok: boolean; summary: Prisma.InputJsonValue; finishedAt: Date },
) {
  return db.jobRun.update({ where: { id }, data });
}

/**
 * Adds one hit to the bucket starting at `windowStart` and returns the hits of every bucket that
 * started after `since` (this one included). The CTE's insert is invisible to the outer SELECT, so
 * the current bucket is counted from RETURNING and excluded from the sum.
 */
export async function incrementRateLimit(key: string, windowStart: Date, since: Date) {
  const [row] = await db.$queryRaw<{ total: number }[]>`
    WITH hit AS (
      INSERT INTO "RateLimitBucket" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
      RETURNING "count"
    )
    SELECT ((SELECT "count" FROM hit) + COALESCE((
      SELECT sum("count") FROM "RateLimitBucket"
      WHERE "key" = ${key} AND "windowStart" > ${since} AND "windowStart" <> ${windowStart}
    ), 0))::int AS total`;
  return row?.total ?? 1;
}

/** Rate-limit buckets older than every window (nightly cleanup). Returns how many were deleted. */
export async function deleteRateLimitBucketsBefore(before: Date) {
  const { count } = await db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: before } } });
  return count;
}
