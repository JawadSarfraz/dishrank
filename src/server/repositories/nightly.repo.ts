// Reads and writes of the nightly recompute (docs/04 recomputeAll). Ages are computed from epoch
// seconds, so the SQL does not depend on the session time zone (columns are UTC TIMESTAMP(3)).
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { inTransaction, type Tx } from "./transaction";

/** When a dish row last showed a sign of life: its latest rating, verification or creation. */
const LAST_SIGN = Prisma.sql`EXTRACT(EPOCH FROM GREATEST("lastRatedAt", "lastVerifiedAt", "createdAt"))::float8`;

/**
 * Starts a JobRun unless another run of the job started less than `timeoutMs` ago and has not
 * finished (an older unfinished run timed out). The advisory lock makes the check and the insert
 * one step, so two runs started at once cannot both begin.
 */
export async function startExclusiveJobRun(name: string, startedAt: Date, timeoutMs: number) {
  return inTransaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`job:${name}`}))`;
    const running = await tx.jobRun.findFirst({
      where: {
        name,
        finishedAt: null,
        startedAt: { gt: new Date(startedAt.getTime() - timeoutMs) },
      },
      select: { id: true },
    });
    if (running) return null;
    return tx.jobRun.create({ data: { name, startedAt }, select: { id: true } });
  });
}

/**
 * docs/04 step 2: DishStat per (city, dish) = the weighted mean of every active rating from a user
 * who is not banned, with the recompute weights (trust × half-life decay at `now`). A (city, dish)
 * with no counted rating keeps its old row: none of its dish rows has a score for C to affect.
 */
export async function upsertDishStats(now: Date, halfLifeDays: number) {
  const nowSeconds = now.getTime() / 1000;
  return db.$executeRaw`
    INSERT INTO "DishStat" ("cityId", "dishId", "meanScore", "ratingCount", "updatedAt")
    SELECT rd."cityId", rd."dishId", sum(w.w * w.score) / sum(w.w), count(*)::int, ${now}
    FROM (
      SELECT rt."restaurantDishId", rt.score,
        u."trustScore" * power(0.5,
          GREATEST(${nowSeconds}::float8 - EXTRACT(EPOCH FROM rt."updatedAt")::float8, 0)
            / 86400.0 / ${halfLifeDays}::float8) AS w
      FROM "Rating" rt
      JOIN "User" u ON u.id = rt."userId" AND u."bannedAt" IS NULL
      WHERE rt.status = 'ACTIVE'
    ) w
    JOIN "RestaurantDish" rd ON rd.id = w."restaurantDishId"
    GROUP BY rd."cityId", rd."dishId"
    HAVING sum(w.w) > 0
    ON CONFLICT ("cityId", "dishId") DO UPDATE SET
      "meanScore" = EXCLUDED."meanScore",
      "ratingCount" = EXCLUDED."ratingCount",
      "updatedAt" = EXCLUDED."updatedAt"`;
}

/**
 * docs/04 step 3: every dish row with a counted rating or old aggregates, and every row with an
 * active rating whose aggregates were never written (a recompute after a commit failed).
 */
export async function listRowsToRecompute() {
  const rows = await db.restaurantDish.findMany({
    where: {
      OR: [
        { ratingCount: { gt: 0 } },
        { score: { not: null } },
        { ratings: { some: { status: "ACTIVE" } } },
      ],
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Every (city, dish) list with at least one dish row, in the lock order (city, then dish). */
export async function listAllCityDishLists() {
  return db.restaurantDish.findMany({
    distinct: ["cityId", "dishId"],
    orderBy: [{ cityId: "asc" }, { dishId: "asc" }],
    select: { cityId: true, dishId: true },
  });
}

/**
 * docs/04 step 4, for one list (call with its lock held): CANDIDATE and USER_CONFIRMED rows with no
 * rating, verification or creation since `unverifiedBefore`, and MENU_VERIFIED and OWNER_VERIFIED
 * rows since `verifiedBefore`, become STALE. Returns how many.
 */
export async function markStaleRowsOfList(
  input: {
    cityId: string;
    dishId: string;
    now: Date;
    unverifiedBefore: Date;
    verifiedBefore: Date;
  },
  tx: Tx,
) {
  return tx.$executeRaw`
    UPDATE "RestaurantDish" SET status = 'STALE', "updatedAt" = ${input.now}
    WHERE "cityId" = ${input.cityId} AND "dishId" = ${input.dishId}
      AND (
        (status IN ('CANDIDATE', 'USER_CONFIRMED')
          AND ${LAST_SIGN} < ${input.unverifiedBefore.getTime() / 1000}::float8)
        OR (status IN ('MENU_VERIFIED', 'OWNER_VERIFIED')
          AND ${LAST_SIGN} < ${input.verifiedBefore.getTime() / 1000}::float8)
      )`;
}

/** The latest snapshot of each list (docs/04 step 6). */
export async function listLatestSnapshots() {
  const rows = await db.rankingSnapshot.groupBy({
    by: ["cityId", "dishId"],
    _max: { computedAt: true },
  });
  return rows.map((r) => ({ cityId: r.cityId, dishId: r.dishId, computedAt: r._max.computedAt }));
}

/** The ranked rows of one list, best first. */
export async function listTopRanked(cityId: string, dishId: string, take: number) {
  return db.restaurantDish.findMany({
    where: { cityId, dishId, rankInCity: { not: null } },
    orderBy: { rankInCity: "asc" },
    take,
    select: { id: true, rankInCity: true, score: true, distinctRaters: true },
  });
}

export async function insertRankingSnapshot(data: {
  cityId: string;
  dishId: string;
  computedAt: Date;
  payload: Prisma.InputJsonValue;
}) {
  await db.rankingSnapshot.create({ data, select: { id: true } });
}
