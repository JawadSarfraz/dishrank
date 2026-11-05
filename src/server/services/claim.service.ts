// Owner claims (docs/07 §4): any signed-in user claims a restaurant with a phone number and a proof
// note → OwnerClaim PENDING + ReviewItem OWNER_CLAIM. An admin checks by phone, then approves
// (claimedByUserId set, role OWNER for a USER; the owner can no longer rate there and their earlier
// ratings there stop counting) or rejects with a reason the claimant sees on /me. Decisions run in
// review.service (decideOwnerClaimTx below) under the restaurant's row lock. Later an admin may
// remove the owner again (removeRestaurantOwner, /admin/restaurants).
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
import { countRestaurantsManagedBy } from "@/server/repositories/owner.repo";
import { listRowsRatedByUserAt } from "@/server/repositories/rating.repo";
import { listDishPagesOfRows } from "@/server/repositories/restaurant-dish.repo";
import {
  findRestaurantById,
  lockRestaurants,
  updateRestaurantById,
} from "@/server/repositories/restaurant.repo";
import { inTransaction, type Tx } from "@/server/repositories/transaction";
import { findRater, findUserRole, lockUser, updateUserById } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import type { ClaimInput, OwnerRemoveInput } from "@/server/validation";
import { recomputeEach } from "./ranking.service";

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

/**
 * /me: the user's claims with their status and, for a rejection, the admin's reason. `managing`:
 * approved, and the restaurant is still theirs (an admin may have removed them as its owner).
 */
export async function listMyClaims(actor: SessionUser | null) {
  const user = assertRole(actor, ["USER", "OWNER", "ADMIN"]);
  const claims = await listClaimsOfUser(user.id);
  return claims.map(({ restaurant: { claimedByUserId, ...restaurant }, ...claim }) => ({
    ...claim,
    restaurant,
    managing: claim.status === "APPROVED" && claimedByUserId === user.id,
  }));
}

type ClaimRestaurant = NonNullable<Awaited<ReturnType<typeof findRestaurantById>>>;

export type ClaimDecision =
  | { approved: true; userId: string; restaurant: ClaimRestaurant; reason: null }
  | { approved: false; userId: string | null; restaurant: ClaimRestaurant; reason: string };

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
): Promise<ClaimDecision> {
  const { claimId } = input.item.payload as ClaimPayload;
  const claim = await findClaimById(claimId, tx);
  if (!claim) {
    // The claim is gone (the claimant deleted their account, or a merge dropped a duplicate): the
    // item can only be rejected, so the queue can always be cleared (audit 2026-11, B-02).
    if (input.action !== "reject") {
      throw new AppError("ITEM_CHANGED", "This claim no longer exists. Reject the item.", 409);
    }
    const restaurant = input.item.restaurantId
      ? await findRestaurantById(input.item.restaurantId, tx)
      : null;
    if (!restaurant) throw new AppError("NOT_FOUND", "Restaurant not found", 404);
    const reason = input.reason?.trim() || "the claim no longer exists";
    return { approved: false, userId: null, restaurant, reason };
  }
  if (claim.restaurantId !== input.item.restaurantId) {
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
  // A banned account is never made an owner (audit 2026-11, B-13): reject the claim instead.
  const claimant = await findRater(claim.userId, tx);
  if (!claimant || claimant.bannedAt) {
    throw new AppError("USER_BANNED", "This account is banned: reject the claim", 409);
  }
  // The claimant's row is locked before anything is written, as a removal locks it
  // (removeRestaurantOwner): one of the two waits for the other, so a user who manages a restaurant
  // never ends up without the role. Before the write, because setting claimedByUserId takes a
  // key-share lock on that row (its foreign key), and two approvals for one claimant that upgraded
  // that lock afterwards would deadlock.
  await lockUser(claim.userId, tx);
  await updateRestaurantById(restaurant.id, { claimedByUserId: claim.userId, claimedAt: now }, tx);
  await updateOwnerClaim(claim.id, { status: "APPROVED", ...reviewed }, tx);
  // A USER becomes OWNER; an ADMIN keeps the admin role (it includes the owner area).
  if ((await findUserRole(claim.userId, tx)) === "USER") {
    await updateUserById(claim.userId, { role: "OWNER" }, tx);
  }
  return { approved: true, userId: claim.userId, restaurant, reason: null };
}

/**
 * "Remove owner" on /admin/restaurants (2026-11-04): the restaurant has no owner any more. Its
 * owner loses the OWNER role unless they manage another restaurant (an ADMIN keeps ADMIN), and the
 * normal rating rules apply to them again: they may rate it, and their earlier ratings there count
 * again (those dish rows are recomputed after commit). The reason is required and logged.
 * `input.ownerId` is the owner the admin saw: anyone else by now answers ITEM_CHANGED.
 */
export async function removeRestaurantOwner(
  actor: SessionUser | null,
  restaurantId: string,
  input: OwnerRemoveInput,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  const removed = await inTransaction(async (tx) => {
    // The restaurant first, then the owner: the order an approval takes (decideOwnerClaimTx). A
    // rating in flight finishes before, and every later one sees no owner.
    await lockRestaurants([restaurantId], tx);
    const restaurant = await findRestaurantById(restaurantId, tx);
    if (!restaurant || restaurant.status === "DUPLICATE") {
      throw new AppError("NOT_FOUND", "Restaurant not found", 404);
    }
    if (!restaurant.claimedByUserId) {
      throw new AppError("NOT_CLAIMED", "Nobody manages this restaurant any more", 409);
    }
    if (restaurant.claimedByUserId !== input.ownerId) {
      throw new AppError(
        "ITEM_CHANGED",
        "The owner changed after you opened the page. Reload it.",
        409,
      );
    }
    const ownerId = restaurant.claimedByUserId;
    await lockUser(ownerId, tx);
    await updateRestaurantById(restaurant.id, { claimedByUserId: null, claimedAt: null }, tx);
    // DECISION-PENDING: their approved claim stays APPROVED as history, dish rows they confirmed stay
    // OWNER_VERIFIED, and the reason goes only to the log (the removed owner is not told it).
    const roleRemoved =
      (await findUserRole(ownerId, tx)) === "OWNER" &&
      (await countRestaurantsManagedBy(ownerId, tx)) === 0;
    if (roleRemoved) await updateUserById(ownerId, { role: "USER" }, tx);
    const rows = await listRowsRatedByUserAt(ownerId, restaurant.id, tx);
    return { restaurant, ownerId, roleRemoved, rows };
  });

  // Committed: their ratings there count again (a failure is only logged; the nightly run repeats it).
  await recomputeEach(removed.rows, now);
  logEvent("admin.restaurant.owner_remove", {
    userId: admin.id,
    entityId: restaurantId,
    ownerId: removed.ownerId,
    roleRemoved: removed.roleRemoved,
    recomputedRows: removed.rows.length,
    // The owner asked for the reason to be logged: the one free-text field in a log line.
    reason: input.reason,
  });
  return {
    id: restaurantId,
    slug: removed.restaurant.slug,
    citySlug: removed.restaurant.city.slug,
    ownerRoleRemoved: removed.roleRemoved,
    /** Ranking and restaurant pages whose scores may have changed. */
    dishPages: await listDishPagesOfRows(removed.rows),
  };
}
