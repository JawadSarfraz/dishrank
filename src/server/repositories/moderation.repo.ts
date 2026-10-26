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

/** A panel member's on-site location (docs/07 §7); never stored on the rating. */
export async function insertLocationObservation(
  data: {
    restaurantId: string;
    userId: string;
    lat: number;
    lng: number;
    accuracyM: number;
    createdAt: Date;
  },
  tx: Tx,
) {
  return tx.locationObservation.create({ data, select: { id: true } });
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

/**
 * Ratings an admin cleared of a burst on one dish row: every rating listed in a released BURST
 * item, also one it left HELD because its COMMENT item is still open. The burst rule never counts
 * or holds them again. Releasing a COMMENT item clears the comment only, not the burst.
 */
export async function listBurstClearedRatingIds(restaurantDishId: string, client: Client = db) {
  const items = await client.reviewItem.findMany({
    where: {
      type: "SUSPICIOUS_RATINGS",
      status: "RESOLVED",
      resolution: { startsWith: "released" },
      AND: [
        { payload: { path: ["restaurantDishId"], equals: restaurantDishId } },
        { payload: { path: ["reason"], equals: "BURST" } },
      ],
    },
    select: { payload: true },
  });
  return new Set(items.flatMap((i) => (i.payload as { ratingIds?: string[] }).ratingIds ?? []));
}

/** Every SUSPICIOUS_RATINGS item of one dish row, any status (a merge moves them to the kept row). */
export async function listSuspiciousItemsOfRow(restaurantDishId: string, tx: Tx) {
  return tx.reviewItem.findMany({
    where: {
      type: "SUSPICIOUS_RATINGS",
      payload: { path: ["restaurantDishId"], equals: restaurantDishId },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, payload: true },
  });
}

/** A review item as it is now, without a lock (to find what to lock before it). */
export async function peekReviewItem(id: string, client: Client = db) {
  return client.reviewItem.findUnique({
    where: { id },
    select: { id: true, type: true, status: true, payload: true, restaurantId: true },
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

/** Locks one review item for a decision (released at commit or rollback). */
export async function lockReviewItem(id: string, tx: Tx) {
  await tx.$queryRaw`SELECT id FROM "ReviewItem" WHERE id = ${id} FOR UPDATE`;
  return tx.reviewItem.findUnique({ where: { id } });
}

export async function closeReviewItem(
  id: string,
  data: {
    status: "RESOLVED" | "REJECTED";
    resolution: string;
    resolvedByUserId?: string;
    resolvedAt: Date;
    restaurantId?: string;
    dishId?: string;
    payload?: Prisma.InputJsonValue;
  },
  tx: Tx,
) {
  return tx.reviewItem.update({ where: { id }, data, select: { id: true } });
}

/** Rating ids listed in the other OPEN SUSPICIOUS_RATINGS items of a dish row. */
export async function listRatingIdsInOtherOpenItems(
  restaurantDishId: string,
  exceptItemId: string,
  tx: Tx,
) {
  const items = await tx.reviewItem.findMany({
    where: {
      type: "SUSPICIOUS_RATINGS",
      status: "OPEN",
      id: { not: exceptItemId },
      payload: { path: ["restaurantDishId"], equals: restaurantDishId },
    },
    select: { payload: true },
  });
  return new Set(items.flatMap((i) => (i.payload as { ratingIds?: string[] }).ratingIds ?? []));
}

/** /admin/review: newest first, cursor = the last id of the previous page. */
export async function listReviewItemsPage(input: {
  type?: ReviewItemType;
  types: readonly ReviewItemType[];
  status: "OPEN" | "RESOLVED" | "REJECTED";
  take: number;
  cursor?: string;
}) {
  return db.reviewItem.findMany({
    where: {
      status: input.status,
      type: input.type ? input.type : { in: [...input.types] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.take,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: {
      createdBy: { select: { id: true, email: true, name: true } },
      resolvedBy: { select: { id: true, email: true } },
      restaurant: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          lat: true,
          lng: true,
          locationSource: true,
          area: { select: { name: true } },
          city: { select: { id: true, slug: true, name: true } },
        },
      },
      dish: { select: { id: true, slug: true, name: true } },
    },
  });
}

export async function countOpenReviewItems(types: readonly ReviewItemType[]) {
  const rows = await db.reviewItem.groupBy({
    by: ["type"],
    where: { status: "OPEN", type: { in: [...types] } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.type, r._count._all])) as Partial<
    Record<ReviewItemType, number>
  >;
}
