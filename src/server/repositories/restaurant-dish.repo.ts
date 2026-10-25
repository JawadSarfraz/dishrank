import { Prisma, type SourceType } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Client, Tx } from "./transaction";

export async function findRestaurantDish(
  restaurantId: string,
  dishId: string,
  client: Client = db,
) {
  return client.restaurantDish.findUnique({
    where: { restaurantId_dishId: { restaurantId, dishId } },
    select: { id: true, status: true },
  });
}

/** A new CANDIDATE row; the caller has checked that none exists. */
export async function insertCandidateDish(
  data: {
    restaurantId: string;
    dishId: string;
    cityId: string;
    source: SourceType;
    confidence: number;
  },
  client: Client = db,
) {
  return client.restaurantDish.create({
    data: { ...data, status: "CANDIDATE" },
    select: { id: true, status: true },
  });
}

/**
 * The (restaurant, dish) row, created as CANDIDATE with the given source when absent. Safe under
 * concurrent calls (INSERT … ON CONFLICT DO NOTHING); `created` tells whether this call added it.
 */
export async function ensureRestaurantDish(
  data: {
    restaurantId: string;
    dishId: string;
    cityId: string;
    source: SourceType;
    confidence: number;
    menuName?: string | null;
    price?: number | null;
  },
  client: Client = db,
) {
  const { count } = await client.restaurantDish.createMany({
    data: [{ ...data, status: "CANDIDATE" }],
    skipDuplicates: true,
  });
  const row = await client.restaurantDish.findUniqueOrThrow({
    where: { restaurantId_dishId: { restaurantId: data.restaurantId, dishId: data.dishId } },
    select: { id: true, status: true },
  });
  return { ...row, created: count > 0 };
}

/** Which of these (restaurant, dish) pairs already exist, for the import preview. */
export async function listRestaurantDishPairs(
  restaurantIds: readonly string[],
  dishIds: readonly string[],
  client: Client = db,
) {
  if (restaurantIds.length === 0 || dishIds.length === 0) return [];
  return client.restaurantDish.findMany({
    where: { restaurantId: { in: [...restaurantIds] }, dishId: { in: [...dishIds] } },
    select: { restaurantId: true, dishId: true },
  });
}

/** Every dish row of a restaurant, with what a merge or a page needs. */
export async function listDishesOfRestaurant(restaurantId: string, client: Client = db) {
  return client.restaurantDish.findMany({
    where: { restaurantId },
    select: {
      id: true,
      dishId: true,
      status: true,
      source: true,
      price: true,
      variantTags: true,
      distinctRaters: true,
      ratingCount: true,
      score: true,
      rankInCity: true,
      dish: { select: { id: true, slug: true, name: true } },
    },
  });
}

export async function lockDishesOfRestaurants(restaurantIds: readonly string[], tx: Tx) {
  return tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "RestaurantDish"
    WHERE "restaurantId" IN (${Prisma.join([...restaurantIds])}) ORDER BY id FOR UPDATE`;
}

export async function moveDishToRestaurant(id: string, restaurantId: string, tx: Tx) {
  return tx.restaurantDish.update({ where: { id }, data: { restaurantId } });
}

export async function updateDishPriceAndTags(
  id: string,
  data: { price: number | null; variantTags: string[] },
  tx: Tx,
) {
  return tx.restaurantDish.update({ where: { id }, data });
}

export async function deleteRestaurantDish(id: string, tx: Tx) {
  return tx.restaurantDish.delete({ where: { id } });
}
