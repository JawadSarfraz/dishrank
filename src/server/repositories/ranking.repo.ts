// Reads and writes for RankingService.recomputeOne (docs/04 "Compute paths").
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./transaction";

/** The (city, dish) list a dish row belongs to; neither ever changes. */
export async function findRestaurantDishList(id: string, tx: Tx) {
  return tx.restaurantDish.findUnique({ where: { id }, select: { cityId: true, dishId: true } });
}

export async function findRestaurantStatus(restaurantId: string, tx: Tx) {
  return tx.restaurant.findUnique({ where: { id: restaurantId }, select: { status: true } });
}

export async function findRankInCity(id: string, tx: Tx) {
  return tx.restaurantDish.findUniqueOrThrow({ where: { id }, select: { rankInCity: true } });
}

/** Locks the dish row for one recompute, so two recomputes of it never interleave. */
export async function lockRestaurantDish(id: string, tx: Tx) {
  const rows = await tx.$queryRaw<
    { id: string; cityId: string; dishId: string; restaurantId: string; status: string }[]
  >`
    SELECT id, "cityId", "dishId", "restaurantId", status::text AS status
    FROM "RestaurantDish" WHERE id = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}

/** Active ratings of one dish row from users who are not banned, with the rater's current trust. */
export async function listCountedRatings(restaurantDishId: string, tx: Tx) {
  const rows = await tx.rating.findMany({
    where: { restaurantDishId, status: "ACTIVE", user: { bannedAt: null } },
    select: { userId: true, score: true, updatedAt: true, user: { select: { trustScore: true } } },
  });
  return rows.map((r) => ({
    userId: r.userId,
    score: r.score,
    updatedAt: r.updatedAt,
    trust: r.user.trustScore,
  }));
}

export async function findDishStat(cityId: string, dishId: string, tx: Tx) {
  return tx.dishStat.findUnique({
    where: { cityId_dishId: { cityId, dishId } },
    select: { meanScore: true, ratingCount: true },
  });
}

export async function findCityLaunch(cityId: string, tx: Tx) {
  return tx.city.findUnique({ where: { id: cityId }, select: { launchedAt: true } });
}

export async function updateRestaurantDishAggregates(
  id: string,
  data: Prisma.RestaurantDishUncheckedUpdateInput,
  tx: Tx,
) {
  return tx.restaurantDish.update({
    where: { id },
    data,
    select: { status: true, rankInCity: true, score: true },
  });
}

/**
 * Takes the locks of several (city, dish) lists in one global order (city id, then dish id), so
 * two transactions that each need more than one list never wait on each other in a cycle.
 */
export async function lockCityDishLists(
  lists: readonly { cityId: string; dishId: string }[],
  tx: Tx,
) {
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  const keys = [...new Map(lists.map((l) => [`${l.cityId}:${l.dishId}`, l])).values()].sort(
    (a, b) => cmp(a.cityId, b.cityId) || cmp(a.dishId, b.dishId),
  );
  for (const l of keys) await lockCityDish(l.cityId, l.dishId, tx);
  return keys;
}

/** Serialises re-ranking of one (city, dish) list (released at commit or rollback). */
export async function lockCityDish(cityId: string, dishId: string, tx: Tx) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`rank:${cityId}:${dishId}`}))`;
}

/**
 * docs/04: rank numbers 1..n for the eligible rows of one (city, dish), city-wide, in ranking order;
 * NULL for every other row. Eligibility is decided here in SQL (CLAUDE.md rule 4).
 */
export async function rerankCityDish(
  input: {
    cityId: string;
    dishId: string;
    statuses: readonly string[];
    minRaters: number;
    minWeight: number;
  },
  tx: Tx,
) {
  const eligible = Prisma.sql`
    SELECT rd.id, (row_number() OVER (
      ORDER BY rd.score DESC, rd."distinctRaters" DESC, rd."lastRatedAt" DESC NULLS LAST,
        r.name ASC, rd.id ASC))::int AS rank
    FROM "RestaurantDish" rd
    JOIN "Restaurant" r ON r.id = rd."restaurantId" AND r.status = 'ACTIVE'
    WHERE rd."cityId" = ${input.cityId} AND rd."dishId" = ${input.dishId}
      AND rd.status::text IN (${Prisma.join([...input.statuses])})
      AND rd."distinctRaters" >= ${input.minRaters}
      AND rd."weightSum" >= ${input.minWeight}
      AND rd.score IS NOT NULL`;
  await tx.$executeRaw`
    UPDATE "RestaurantDish" SET "rankInCity" = NULL
    WHERE "cityId" = ${input.cityId} AND "dishId" = ${input.dishId} AND "rankInCity" IS NOT NULL
      AND id NOT IN (SELECT e.id FROM (${eligible}) e)`;
  await tx.$executeRaw`
    UPDATE "RestaurantDish" AS rd SET "rankInCity" = e.rank
    FROM (${eligible}) e
    WHERE rd.id = e.id AND rd."rankInCity" IS DISTINCT FROM e.rank`;
}

/** The (city, dish) lists a restaurant appears in, for re-ranking after a status change or merge. */
export async function listDishGroupsOfRestaurant(restaurantId: string, tx: Tx) {
  return tx.restaurantDish.findMany({
    where: { restaurantId },
    distinct: ["cityId", "dishId"],
    select: { cityId: true, dishId: true },
  });
}
