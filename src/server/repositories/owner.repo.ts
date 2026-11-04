// The owner area (docs/07 §4, Phase 6): an owner's restaurants, their dish rows and the weekly
// snapshots of those dishes' rankings. Never anything about who rated.
import { db } from "@/server/db";
import type { Client } from "./transaction";

/** Restaurants this user manages (claimedByUserId), not merged away. */
export async function listRestaurantsManagedBy(userId: string) {
  return db.restaurant.findMany({
    where: { claimedByUserId: userId, status: { not: "DUPLICATE" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      area: { select: { name: true } },
      city: { select: { slug: true, name: true } },
      _count: { select: { dishes: { where: { status: { not: "REMOVED" } } } } },
    },
  });
}

/** How many restaurants this user manages (claimedByUserId), not merged away. */
export async function countRestaurantsManagedBy(userId: string, client: Client = db) {
  return client.restaurant.count({
    where: { claimedByUserId: userId, status: { not: "DUPLICATE" } },
  });
}

/** One restaurant as its owner sees it. */
export async function findRestaurantForOwner(id: string, client: Client = db) {
  return client.restaurant.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      cityId: true,
      claimedByUserId: true,
      area: { select: { name: true } },
      city: { select: { slug: true, name: true } },
    },
  });
}

/** Its dish rows with what the owner may see and edit (aggregates only, no ratings). */
export async function listDishRowsForOwner(restaurantId: string) {
  return db.restaurantDish.findMany({
    where: { restaurantId },
    orderBy: [{ rankInCity: { sort: "asc", nulls: "last" } }, { distinctRaters: "desc" }],
    select: {
      id: true,
      status: true,
      menuName: true,
      price: true,
      variantTags: true,
      distinctRaters: true,
      score: true,
      rankInCity: true,
      lastVerifiedAt: true,
      dish: { select: { id: true, slug: true, name: true } },
    },
  });
}

/** The weekly snapshots of these (city, dish) lists since `since`, oldest first (docs/04 step 6). */
export async function listSnapshotsOfDishes(
  cityId: string,
  dishIds: readonly string[],
  since: Date,
) {
  if (dishIds.length === 0) return [];
  return db.rankingSnapshot.findMany({
    where: { cityId, dishId: { in: [...dishIds] }, computedAt: { gte: since } },
    orderBy: { computedAt: "asc" },
    select: { dishId: true, computedAt: true, payload: true },
  });
}

/** A dish row with its restaurant's owner, to check an owner edit. */
export async function findDishRowWithOwner(id: string, client: Client = db) {
  return client.restaurantDish.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      restaurantId: true,
      restaurant: { select: { claimedByUserId: true, status: true } },
    },
  });
}
