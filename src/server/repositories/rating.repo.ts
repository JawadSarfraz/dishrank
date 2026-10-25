import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./transaction";

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
