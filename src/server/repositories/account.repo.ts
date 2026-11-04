// Deleting one's own account (Phase 6). What goes and what stays is listed in deleteAccountTx.
import type { ReviewItemType } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Client, Tx } from "./transaction";

/** Every rating of the user, any status, with its dish row and photo. */
export async function listRatingsForDeletion(userId: string, client: Client = db) {
  return client.rating.findMany({
    where: { userId },
    select: { id: true, restaurantDishId: true, photoPath: true },
  });
}

/** Review items the user filed that nobody has decided yet: they go with the account. */
// DECISION-PENDING: decided items stay (the record of an admin's decision), without the name.
const FILED_BY_USER: ReviewItemType[] = [
  "FLAG",
  "DISH_PROPOSAL",
  "RESTAURANT_PROPOSAL",
  "OWNER_CLAIM",
];

/**
 * Deletes the account and everything that is only theirs, in one transaction (the caller holds the
 * locks of their dish rows and their user row):
 * - ratings with their history; open reports, disputes, suggestions and claims they filed;
 *   unused pairwise votes; their rate-limit counters;
 * - the User row, which takes sessions, Google accounts, panel locations, claims, flags and upload
 *   rows with it (onDelete Cascade).
 * Kept without the name (SET NULL): menu photos they uploaded (a restaurant's menu), review items
 * already decided, and the restaurants they managed (no longer claimed).
 */
export async function deleteAccountTx(userId: string, tx: Tx) {
  const ratings = await tx.rating.deleteMany({ where: { userId } });
  const items = await tx.reviewItem.deleteMany({
    where: { createdByUserId: userId, status: "OPEN", type: { in: FILED_BY_USER } },
  });
  await tx.pairwiseVote.deleteMany({ where: { userId } });
  await tx.rateLimitBucket.deleteMany({ where: { key: { startsWith: `user:${userId}:` } } });
  await tx.user.delete({ where: { id: userId }, select: { id: true } });
  return { ratings: ratings.count, reviewItems: items.count };
}
