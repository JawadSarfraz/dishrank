import { Prisma, type RatingStatus } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Client, Tx } from "./transaction";

export async function listRatingsOfRestaurantDishes(restaurantDishIds: readonly string[], tx: Tx) {
  if (restaurantDishIds.length === 0) return [];
  return tx.rating.findMany({
    where: { restaurantDishId: { in: [...restaurantDishIds] } },
    select: {
      id: true,
      restaurantDishId: true,
      userId: true,
      score: true,
      comment: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/** Appends an older rating's score and comment to the kept rating's history (docs/07 §2 step 2). */
export async function addRatingHistory(
  data: { ratingId: string; score: number; comment: string | null; createdAt: Date },
  tx: Tx,
) {
  return tx.ratingHistory.create({ data });
}

export async function moveRatingHistory(fromRatingId: string, toRatingId: string, tx: Tx) {
  return tx.ratingHistory.updateMany({
    where: { ratingId: fromRatingId },
    data: { ratingId: toRatingId },
  });
}

export async function deleteRating(id: string, tx: Tx) {
  return tx.rating.delete({ where: { id } });
}

/**
 * Re-points ratings to another RestaurantDish with plain SQL, so `updatedAt` (the decay clock)
 * is not bumped by Prisma's @updatedAt.
 */
export async function moveRatings(ratingIds: readonly string[], restaurantDishId: string, tx: Tx) {
  if (ratingIds.length === 0) return 0;
  return tx.$executeRaw`
    UPDATE "Rating" SET "restaurantDishId" = ${restaurantDishId}
    WHERE id IN (${Prisma.join([...ratingIds])})`;
}

/** One user's rating of one dish row (ratings are unique per user per row). */
export async function findRatingOfUser(
  restaurantDishId: string,
  userId: string,
  client: Client = db,
) {
  return client.rating.findUnique({
    where: { restaurantDishId_userId: { restaurantDishId, userId } },
  });
}

export async function insertRating(data: Prisma.RatingUncheckedCreateInput, tx: Tx) {
  return tx.rating.create({ data, select: { id: true, status: true } });
}

export async function updateRating(id: string, data: Prisma.RatingUncheckedUpdateInput, tx: Tx) {
  return tx.rating.update({ where: { id }, data, select: { id: true, status: true } });
}

/** The rating that already uses a photo, if any (one photo belongs to one rating). */
export async function findRatingByPhotoPath(photoPath: string, client: Client = db) {
  return client.rating.findFirst({ where: { photoPath }, select: { id: true } });
}

/** A rating with what deleting it or listing it needs. */
export async function findRatingWithPlace(id: string, client: Client = db) {
  return client.rating.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      photoPath: true,
      restaurantDishId: true,
      restaurantDish: {
        select: {
          dish: { select: { slug: true } },
          restaurant: { select: { slug: true, city: { select: { slug: true } } } },
        },
      },
    },
  });
}

/**
 * docs/04 burst rule: ratings that arrived on a dish row since `since` (createdAt: an edit is not a
 * new arrival) from non-panel accounts created after `newAccountsSince`; HIDDEN ones are settled.
 */
export async function listBurstRatings(
  restaurantDishId: string,
  since: Date,
  newAccountsSince: Date,
  tx: Tx,
) {
  return tx.rating.findMany({
    where: {
      restaurantDishId,
      createdAt: { gte: since },
      status: { in: ["ACTIVE", "HELD"] },
      user: { isPanel: false, createdAt: { gt: newAccountsSince } },
    },
    select: { id: true, status: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Sets a status on ratings with plain SQL, so `updatedAt` (the decay clock) does not move. */
export async function setRatingStatus(ids: readonly string[], status: RatingStatus, tx: Tx) {
  if (ids.length === 0) return 0;
  return tx.$executeRaw`
    UPDATE "Rating" SET status = ${status}::"RatingStatus"
    WHERE id IN (${Prisma.join([...ids])})`;
}

/** /me and GET /api/v1/me/ratings: newest first, cursor = the last rating id of the previous page. */
export async function listRatingsOfUser(userId: string, take: number, cursor?: string) {
  return db.rating.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      score: true,
      taste: true,
      portion: true,
      value: true,
      comment: true,
      photoPath: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      restaurantDish: {
        select: {
          id: true,
          dish: { select: { id: true, slug: true, name: true } },
          restaurant: {
            select: {
              id: true,
              slug: true,
              name: true,
              status: true,
              area: { select: { name: true } },
              city: { select: { slug: true, name: true } },
            },
          },
        },
      },
    },
  });
}
