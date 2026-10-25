// Flags, owner claims, menu uploads, location observations and review items: the moves a
// restaurant merge needs, and review item helpers.
import type { Prisma, ReviewItemType } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Client, Tx } from "./transaction";

export async function listFlagsOfRestaurantDishes(restaurantDishIds: readonly string[], tx: Tx) {
  if (restaurantDishIds.length === 0) return [];
  return tx.flag.findMany({
    where: { restaurantDishId: { in: [...restaurantDishIds] } },
    select: { id: true, restaurantDishId: true, userId: true, reason: true },
  });
}

export async function moveFlags(ids: readonly string[], restaurantDishId: string, tx: Tx) {
  if (ids.length === 0) return { count: 0 };
  return tx.flag.updateMany({ where: { id: { in: [...ids] } }, data: { restaurantDishId } });
}

export async function deleteFlags(ids: readonly string[], tx: Tx) {
  if (ids.length === 0) return { count: 0 };
  return tx.flag.deleteMany({ where: { id: { in: [...ids] } } });
}

export async function listClaimsOfRestaurant(restaurantId: string, tx: Tx) {
  return tx.ownerClaim.findMany({ where: { restaurantId }, select: { id: true, userId: true } });
}

export async function moveClaims(ids: readonly string[], restaurantId: string, tx: Tx) {
  if (ids.length === 0) return { count: 0 };
  return tx.ownerClaim.updateMany({ where: { id: { in: [...ids] } }, data: { restaurantId } });
}

export async function deleteClaims(ids: readonly string[], tx: Tx) {
  if (ids.length === 0) return { count: 0 };
  return tx.ownerClaim.deleteMany({ where: { id: { in: [...ids] } } });
}

export async function moveMenuUploads(fromRestaurantId: string, toRestaurantId: string, tx: Tx) {
  return tx.menuUpload.updateMany({
    where: { restaurantId: fromRestaurantId },
    data: { restaurantId: toRestaurantId },
  });
}

/** Panel members' on-site locations describe the place, so they follow it into a merge. */
export async function moveLocationObservations(
  fromRestaurantId: string,
  toRestaurantId: string,
  tx: Tx,
) {
  return tx.locationObservation.updateMany({
    where: { restaurantId: fromRestaurantId },
    data: { restaurantId: toRestaurantId },
  });
}

export async function moveOpenReviewItems(
  fromRestaurantId: string,
  toRestaurantId: string,
  tx: Tx,
) {
  return tx.reviewItem.updateMany({
    where: { restaurantId: fromRestaurantId, status: "OPEN" },
    data: { restaurantId: toRestaurantId },
  });
}

export async function findOpenReviewItem(
  type: ReviewItemType,
  restaurantId: string,
  client: Client = db,
) {
  return client.reviewItem.findFirst({
    where: { type, restaurantId, status: "OPEN" },
    select: { id: true, payload: true },
  });
}

/** The OPEN item of a type for one dish row and reason (payload.restaurantDishId, payload.reason). */
export async function findOpenItemForDishRow(
  type: ReviewItemType,
  restaurantDishId: string,
  reason: string,
  client: Client = db,
) {
  return client.reviewItem.findFirst({
    where: {
      type,
      status: "OPEN",
      AND: [
        { payload: { path: ["restaurantDishId"], equals: restaurantDishId } },
        { payload: { path: ["reason"], equals: reason } },
      ],
    },
    select: { id: true, payload: true },
  });
}

/** One person's OPEN items of a type (to avoid filing the same suggestion twice). */
export async function listOpenItemsCreatedBy(type: ReviewItemType, userId: string) {
  return db.reviewItem.findMany({
    where: { type, status: "OPEN", createdByUserId: userId },
    select: { id: true, payload: true },
  });
}

export async function createReviewItem(
  data: {
    type: ReviewItemType;
    payload: Prisma.InputJsonValue;
    restaurantId?: string | null;
    dishId?: string | null;
    createdByUserId?: string | null;
  },
  client: Client = db,
) {
  return client.reviewItem.create({ data, select: { id: true } });
}

export async function updateReviewItemPayload(
  id: string,
  payload: Prisma.InputJsonValue,
  client: Client = db,
) {
  return client.reviewItem.update({ where: { id }, data: { payload }, select: { id: true } });
}

/** Closes every OPEN item of this type for the restaurant (no resolver: the system resolved it). */
export async function resolveOpenReviewItems(
  type: ReviewItemType,
  restaurantId: string,
  resolution: string,
  at: Date,
  client: Client = db,
) {
  return client.reviewItem.updateMany({
    where: { type, restaurantId, status: "OPEN" },
    data: { status: "RESOLVED", resolution, resolvedAt: at },
  });
}
