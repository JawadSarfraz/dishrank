// Owner claims (docs/07 §4): any signed-in user claims a restaurant with a phone number and a proof
// note → OwnerClaim PENDING + ReviewItem OWNER_CLAIM. An admin checks by phone, then approves
// (claimedByUserId set, role OWNER for a USER; the owner can no longer rate there and their earlier
// ratings there stop counting) or rejects with a reason the claimant sees on /me. Decisions run in
// review.service (decideOwnerClaimTx below) under the restaurant's row lock.
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import {
  createReviewItem,
  findClaimById,
  findPendingClaim,
  insertOwnerClaim,
  listClaimsOfUser,
  updateOwnerClaim,
} from "@/server/repositories/moderation.repo";
import { findRestaurantById, updateRestaurantById } from "@/server/repositories/restaurant.repo";
import { inTransaction, type Tx } from "@/server/repositories/transaction";
import { findRater, findUserRole, updateUserById } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import type { ClaimInput } from "@/server/validation";

export type ClaimPayload = { claimId: string; phone: string; proofNote: string | null };

/** "Claim this restaurant" on the restaurant page. Limit: user:{id}:claim. */
export async function submitClaim(
  actor: SessionUser | null,
  input: ClaimInput,
  now: Date = new Date(),
) {
  const user = assertRole(actor, ["USER", "OWNER", "ADMIN"]);
  const rater = await findRater(user.id);
  if (!rater || rater.bannedAt) throw new AppError("USER_BANNED", "This account cannot claim", 403);
  const restaurant = await findRestaurantById(input.restaurantId);
  if (!restaurant || restaurant.status === "DUPLICATE") {
    throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  }
  if (restaurant.status !== "ACTIVE") {
    throw new AppError("RESTAURANT_INACTIVE", "This restaurant is not open on DishRank", 409);
  }
  if (restaurant.claimedByUserId === user.id) {
    throw new AppError("ALREADY_OWNER", "You already manage this restaurant", 409);
  }
  if (restaurant.claimedByUserId) {
    // DECISION-PENDING: a claimed restaurant cannot be claimed again; a dispute reaches the admin.
    throw new AppError(
      "RESTAURANT_CLAIMED",
      "Someone already manages this restaurant. If that is wrong, tell us on the dispute page.",
      409,
    );
  }
  const pending = await findPendingClaim(user.id, restaurant.id);
  if (pending) return { id: pending.id, status: pending.status, duplicate: true };
  await assertRateLimit(`user:${user.id}:claim`, RATE_LIMITS.claim, now);
  const claim = await inTransaction(async (tx) => {
    const created = await insertOwnerClaim(
      {
        restaurantId: restaurant.id,
        userId: user.id,
        phone: input.phone,
        proofNote: input.proofNote,
      },
      tx,
    );
    await createReviewItem(
      {
        type: "OWNER_CLAIM",
        payload: { claimId: created.id, phone: input.phone, proofNote: input.proofNote },
        restaurantId: restaurant.id,
        createdByUserId: user.id,
      },
      tx,
    );
    return created;
  });
  logEvent("claim.submit", { userId: user.id, entityId: claim.id, restaurantId: restaurant.id });
  return { id: claim.id, status: claim.status, duplicate: false };
}

/** /me: the user's claims with their status and, for a rejection, the admin's reason. */
export async function listMyClaims(actor: SessionUser | null) {
  const user = assertRole(actor, ["USER", "OWNER", "ADMIN"]);
  return listClaimsOfUser(user.id);
}

/**
 * The admin's decision on an OWNER_CLAIM item, inside the review transaction after the
 * restaurant's row lock (review.service lockItemParents). Returns what changed.
 */
export async function decideOwnerClaimTx(
  input: {
    item: { payload: unknown; restaurantId: string | null };
    action: "approve" | "reject";
    reason?: string | null;
    adminId: string;
  },
  now: Date,
  tx: Tx,
) {
  const { claimId } = input.item.payload as ClaimPayload;
  const claim = await findClaimById(claimId, tx);
  if (!claim || claim.restaurantId !== input.item.restaurantId) {
    throw new AppError("ITEM_CHANGED", "This claim changed after you opened it. Reload it.", 409);
  }
  if (claim.status !== "PENDING") {
    throw new AppError("ITEM_CLOSED", "This claim was already decided", 409);
  }
  const restaurant = await findRestaurantById(claim.restaurantId, tx);
  if (!restaurant || restaurant.status === "DUPLICATE") {
    throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  }
  const reviewed = { reviewedAt: now, reviewedByUserId: input.adminId };
  if (input.action === "reject") {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new AppError(
        "VALIDATION_FAILED",
        "Say why the claim is rejected (the claimant sees it)",
        400,
      );
    }
    await updateOwnerClaim(claim.id, { status: "REJECTED", rejectReason: reason, ...reviewed }, tx);
    return { approved: false, userId: claim.userId, restaurant, reason };
  }
  if (restaurant.claimedByUserId && restaurant.claimedByUserId !== claim.userId) {
    throw new AppError("RESTAURANT_CLAIMED", "Another owner manages this restaurant already", 409);
  }
  await updateRestaurantById(restaurant.id, { claimedByUserId: claim.userId, claimedAt: now }, tx);
  await updateOwnerClaim(claim.id, { status: "APPROVED", ...reviewed }, tx);
  // A USER becomes OWNER; an ADMIN keeps the admin role (it includes the owner area).
  if ((await findUserRole(claim.userId, tx)) === "USER") {
    await updateUserById(claim.userId, { role: "OWNER" }, tx);
  }
  return { approved: true, userId: claim.userId, restaurant, reason: null };
}
