// RatingService (docs/04 "Abuse controls", docs/06 POST/DELETE /api/v1/ratings). Every rule runs
// here, before anything is written: the restaurant must be ACTIVE, owners cannot rate their own
// restaurant, rate limits (panel limits included), canonical dishes only. Then one transaction
// writes the rating (replacing the user's earlier one and keeping it in RatingHistory), holds it
// when its comment carries contact details, applies the burst rule, and RankingService recomputes
// the dish row after commit. HELD and HIDDEN ratings never count.
// Locks, in the order every writer takes them: restaurant (shared) → dish row → the user's rating
// → review item. Admin decisions and merges use the same order, so they never deadlock with a
// rating and never lose each other's writes.
import type { Prisma, RatingStatus, RestaurantStatus } from "@/generated/prisma/client";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import {
  createReviewItem,
  findOpenItemForDishRow,
  listBurstClearedRatingIds,
  lockReviewItem,
  updateReviewItemPayload,
} from "@/server/repositories/moderation.repo";
import { lockRestaurantDish } from "@/server/repositories/ranking.repo";
import {
  addRatingHistory,
  findRatingByPhotoPath,
  findRatingOfUser,
  findRatingRow,
  findRatingWithPlace,
  insertRating,
  listBurstRatings,
  deleteRating,
  listRatingsOfUser,
  lockRatingById,
  lockRatingOfUser,
  setRatingStatus,
  updateRating,
} from "@/server/repositories/rating.repo";
import {
  ensureRestaurantDish,
  findRestaurantDish,
  listDishPagesOfRows,
  reviveRestaurantDish,
} from "@/server/repositories/restaurant-dish.repo";
import { findRestaurantById, lockRestaurantForRating } from "@/server/repositories/restaurant.repo";
import { findDishById } from "@/server/repositories/taxonomy.repo";
import { inTransaction, isUniqueViolation, type Tx } from "@/server/repositories/transaction";
import { adjustRatingCounters, findRater } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import { getStorage, type StorageAdapter } from "@/server/storage";
import type { MeRatingsQuery, RatingInput } from "@/server/validation";
import { screenComment, type CommentFlag } from "./comment-screen";
import { rethrowConflict } from "./conflict";
import { BURST, USER_DISH } from "./ranking.constants";
import { recomputeEach, recomputeOne, type Thresholds } from "./ranking.service";
import { verifyUploadedPhoto } from "./upload.service";

/** Why a rating is held: its comment (docs/04 control 5) or a burst of new accounts (control 3). */
export type HoldReason = "COMMENT" | "BURST";

export type RatingResult = {
  ratingId: string;
  restaurantDishId: string;
  created: boolean;
  /** HELD = under review; HIDDEN = an admin hid this rating earlier, and an edit keeps it hidden. */
  status: RatingStatus;
  held: boolean;
  heldReason: HoldReason | null;
  /** Saved, but the dish row could not be recomputed yet: the numbers below are not current. */
  stale: boolean;
  /** The dish row after the recompute. */
  score: number | null;
  votes: number;
  eligible: boolean;
  rank: number | null;
  ratingsNeeded: number;
  mode: Thresholds["mode"];
  restaurant: { id: string; slug: string; name: string; citySlug: string };
  dish: { id: string; slug: string; name: string };
};

export type RatingContext = {
  ipHash?: string;
  now?: Date;
  /** Photo storage; defaults to the configured one (null when uploads are not set up). */
  storage?: StorageAdapter | null;
};

const SIGNED_IN = ["USER", "OWNER", "ADMIN"] as const;

async function loadRater(actor: SessionUser | null) {
  const user = assertRole(actor, SIGNED_IN);
  const rater = await findRater(user.id);
  if (!rater) throw new AppError("UNAUTHENTICATED", "Sign in required", 401);
  if (rater.bannedAt) throw new AppError("USER_BANNED", "This account cannot rate", 403);
  return rater;
}

/** docs/04 control 1: a diner rates (or adds dishes to) ACTIVE restaurants that are not theirs. */
function assertRateable(
  restaurant: { status: RestaurantStatus; claimedByUserId: string | null } | null,
  userId: string,
) {
  if (!restaurant) throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  if (restaurant.status !== "ACTIVE") {
    throw new AppError("RESTAURANT_INACTIVE", "This restaurant is not open for ratings", 409);
  }
  if (restaurant.claimedByUserId === userId) {
    throw new AppError("OWNER_SELF_RATING", "You cannot rate your own restaurant", 403);
  }
}

/** The restaurant a diner may rate or add a dish to: it exists, is ACTIVE and is not theirs. */
async function loadRateableRestaurant(restaurantId: string, userId: string) {
  const restaurant = await findRestaurantById(restaurantId);
  // Owners cannot rate their own restaurant (panel members neither). Checked again under a lock
  // inside the write's transaction.
  assertRateable(restaurant, userId);
  return restaurant!;
}

async function loadDish(dishId: string) {
  const dish = await findDishById(dishId);
  if (!dish) throw new AppError("DISH_NOT_FOUND", "Pick a dish from the list", 404);
  return dish;
}

/**
 * Holds `ratingIds` of one dish row with a SUSPICIOUS_RATINGS item: one OPEN item per row and
 * reason, so new ids join the open item instead of opening another. The item is locked and read
 * again first: one an admin closed meanwhile is left as it is, and a new item opens.
 */
async function openHoldItem(
  input: {
    restaurantDishId: string;
    restaurantId: string;
    dishId: string;
    reason: HoldReason;
    ratingIds: string[];
    flag?: CommentFlag;
  },
  tx: Tx,
) {
  const found = await findOpenItemForDishRow(
    "SUSPICIOUS_RATINGS",
    input.restaurantDishId,
    input.reason,
    tx,
  );
  const open = found ? await lockReviewItem(found.id, tx) : null;
  if (open?.status === "OPEN") {
    const payload = open.payload as { ratingIds?: string[]; flags?: string[] };
    const ratingIds = [...new Set([...(payload.ratingIds ?? []), ...input.ratingIds])];
    const flags = [...new Set([...(payload.flags ?? []), ...(input.flag ? [input.flag] : [])])];
    if (
      ratingIds.length !== (payload.ratingIds ?? []).length ||
      flags.length !== (payload.flags ?? []).length
    ) {
      await updateReviewItemPayload(open.id, { ...payload, ratingIds, flags }, tx);
    }
    return open.id;
  }
  const item = await createReviewItem(
    {
      type: "SUSPICIOUS_RATINGS",
      restaurantId: input.restaurantId,
      dishId: input.dishId,
      payload: {
        restaurantDishId: input.restaurantDishId,
        ratingIds: input.ratingIds,
        reason: input.reason,
        flags: input.flag ? [input.flag] : [],
      },
    },
    tx,
  );
  return item.id;
}

/**
 * docs/04 control 3: ≥ 5 ratings of one dish row within 24 h from non-panel accounts younger than
 * 7 days (when they rated) → all of them HELD, listed in one SUSPICIOUS_RATINGS item. Returns the
 * ids it changed to HELD.
 */
async function applyBurstRule(
  rd: { id: string; restaurantId: string; dishId: string },
  now: Date,
  tx: Tx,
): Promise<string[]> {
  // Ratings an admin cleared of a burst on this row were judged genuine: they neither count nor
  // get held again (also one still HELD for its comment).
  const released = await listBurstClearedRatingIds(rd.id, tx);
  const ratings = (
    await listBurstRatings(
      rd.id,
      new Date(now.getTime() - BURST.windowHours * 3_600_000),
      BURST.newAccountDays,
      tx,
    )
  ).filter((r) => !released.has(r.id));
  if (ratings.length < BURST.ratings) return [];
  // Every qualifying rating is listed, also one already HELD for its comment, so the burst
  // decision covers all of them; only the ACTIVE ones change status.
  const toHold = ratings.filter((r) => r.status === "ACTIVE").map((r) => r.id);
  await setRatingStatus(toHold, "HELD", tx);
  await openHoldItem(
    {
      restaurantDishId: rd.id,
      restaurantId: rd.restaurantId,
      dishId: rd.dishId,
      reason: "BURST",
      ratingIds: ratings.map((r) => r.id),
    },
    tx,
  );
  return toHold;
}

/**
 * POST /api/v1/ratings: a diner's 1–10 score for a dish at a restaurant. A dish the restaurant does
 * not list yet is added from the canonical list (CANDIDATE, USER, 0.5). Re-rating replaces the
 * earlier rating and keeps it in RatingHistory.
 */
export async function createOrReplace(
  actor: SessionUser | null,
  input: RatingInput,
  ctx: RatingContext = {},
): Promise<RatingResult> {
  const started = Date.now();
  const now = ctx.now ?? new Date();
  const rater = await loadRater(actor);
  const restaurant = await loadRateableRestaurant(input.restaurantId, rater.id);
  const dish = await loadDish(input.dishId);
  const existingRow = await findRestaurantDish(restaurant.id, dish.id);
  if (input.photoPath) {
    const previous = existingRow ? await findRatingOfUser(existingRow.id, rater.id) : null;
    if (input.photoPath !== previous?.photoPath) {
      await verifyUploadedPhoto(
        input.photoPath,
        rater.id,
        ctx.storage === undefined ? getStorage() : ctx.storage,
      );
      const user = await findRatingByPhotoPath(input.photoPath);
      if (user && user.id !== previous?.id) {
        throw new AppError("PHOTO_IN_USE", "That photo is already on another rating", 409);
      }
    }
  }

  // docs/04 control 2: every submission counts, new or replaced (panel members get more).
  await assertRateLimit(
    `user:${rater.id}:rating`,
    rater.isPanel ? RATE_LIMITS.ratingPanel : RATE_LIMITS.rating,
    now,
  );
  await assertRateLimit(
    `user:${rater.id}:rating:restaurant:${restaurant.id}`,
    rater.isPanel ? RATE_LIMITS.ratingRestaurantPanel : RATE_LIMITS.ratingRestaurant,
    now,
  );
  const flag = screenComment(input.comment);

  const written = await inTransaction(async (tx) => {
    // docs/04 control 1 again, under a share lock: a merge, closing or claim that committed since
    // the checks above is seen here, and one that starts now waits for this rating.
    assertRateable(await lockRestaurantForRating(restaurant.id, tx), rater.id);
    const ensured = await ensureRestaurantDish(
      { restaurantId: restaurant.id, dishId: dish.id, cityId: restaurant.cityId, ...USER_DISH },
      tx,
    );
    // One writer per dish row at a time, so the burst count below sees every rating.
    const rd = await lockRestaurantDish(ensured.id, tx);
    if (!rd) throw new AppError("NOT_FOUND", "Dish row not found", 404);
    if (rd.status === "REMOVED") {
      throw new AppError("DISH_REMOVED", "This restaurant no longer serves that dish", 409);
    }

    // Locked: an admin decision on this rating is either already committed (and kept below) or
    // waits until this edit commits.
    const previous = await lockRatingOfUser(rd.id, rater.id, tx);
    // An admin's HELD or HIDDEN decision survives an edit; a flagged comment holds an active one.
    const status: RatingStatus =
      previous && previous.status !== "ACTIVE" ? previous.status : flag ? "HELD" : "ACTIVE";
    const fields = {
      score: input.score,
      taste: input.taste ?? null,
      portion: input.portion ?? null,
      value: input.value ?? null,
      comment: input.comment ?? null,
      photoPath: input.photoPath ?? null,
      status,
      weight: rater.trustScore, // trust at write time, for the record (docs/03)
      ipHash: ctx.ipHash ?? null,
    } satisfies Prisma.RatingUncheckedUpdateInput;

    let ratingId: string;
    if (previous) {
      await addRatingHistory(
        {
          ratingId: previous.id,
          score: previous.score,
          comment: previous.comment,
          createdAt: previous.updatedAt,
        },
        tx,
      );
      ratingId = (await updateRating(previous.id, { ...fields, updatedAt: now }, tx)).id;
    } else {
      ratingId = (
        await insertRating(
          {
            ...fields,
            restaurantDishId: rd.id,
            userId: rater.id,
            createdAt: now,
            updatedAt: now,
          },
          tx,
        )
      ).id;
    }

    let heldReason: HoldReason | null = null;
    // A flagged comment always joins the row's COMMENT item, also on a rating already held (e.g. by
    // the burst rule), so releasing the burst can never publish it unreviewed.
    if (flag && status === "HELD") {
      heldReason = "COMMENT";
      await openHoldItem(
        {
          restaurantDishId: rd.id,
          restaurantId: restaurant.id,
          dishId: dish.id,
          reason: "COMMENT",
          ratingIds: [ratingId],
          flag,
        },
        tx,
      );
    }

    // docs/02 lifecycle: a new rating revives a STALE row.
    if (rd.status === "STALE" && status === "ACTIVE") {
      await reviveRestaurantDish(rd.id, now, tx);
    }

    const burstHeld = await applyBurstRule(rd, now, tx);
    if (burstHeld.includes(ratingId)) heldReason = "BURST";
    const finalStatus: RatingStatus = burstHeld.includes(ratingId) ? "HELD" : status;
    // The user's counters last: user rows come after review items and ratings (docs/02).
    await adjustRatingCounters(
      rater.id,
      {
        ratings: previous ? 0 : 1,
        photos: Number(Boolean(fields.photoPath)) - Number(Boolean(previous?.photoPath)),
      },
      tx,
    );
    return {
      ratingId,
      restaurantDishId: rd.id,
      created: !previous,
      rowCreated: ensured.created,
      // A held or hidden rating does not count; the diner sees "under review" or "not counted".
      held: finalStatus !== "ACTIVE",
      heldReason,
      status: finalStatus,
    };
  }).catch((error: unknown) => {
    // Two ratings saved at the same moment with one photo: the unique photoPath keeps one.
    if (isUniqueViolation(error) && JSON.stringify(error).includes("photoPath")) {
      throw new AppError("PHOTO_IN_USE", "That photo is already on another rating", 409);
    }
    return rethrowConflict(error);
  });

  // The rating is saved: a failed recompute is logged and reported as `stale`, not as a failed save
  // (saving again would only repeat the write).
  const ranked = await recomputeOne(written.restaurantDishId, now).catch((error: unknown) => {
    logEvent(
      "ranking.recompute_failed",
      {
        entityId: written.restaurantDishId,
        error: error instanceof Error ? error.message : String(error),
      },
      "error",
    );
    return undefined;
  });
  logEvent("rating.write", {
    userId: rater.id,
    entityId: written.ratingId,
    restaurantDishId: written.restaurantDishId,
    created: written.created,
    rowCreated: written.rowCreated,
    status: written.status,
    heldReason: written.heldReason,
    durationMs: Date.now() - started,
  });
  return {
    ratingId: written.ratingId,
    restaurantDishId: written.restaurantDishId,
    created: written.created,
    status: written.status,
    held: written.held,
    heldReason: written.heldReason,
    stale: ranked === undefined,
    score: ranked?.score ?? null,
    votes: ranked?.votes ?? 0,
    eligible: ranked?.eligible ?? false,
    rank: ranked?.rankInCity ?? null,
    ratingsNeeded: ranked?.ratingsNeeded ?? 0,
    mode: ranked?.thresholds.mode ?? "bootstrap",
    restaurant: {
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      citySlug: restaurant.city.slug,
    },
    dish: { id: dish.id, slug: dish.slug, name: dish.name },
  };
}

/** DELETE /api/v1/ratings/:id: own ratings only; the dish row is recomputed afterwards. */
export async function deleteOwn(
  actor: SessionUser | null,
  ratingId: string,
  ctx: RatingContext = {},
) {
  const now = ctx.now ?? new Date();
  const user = assertRole(actor, SIGNED_IN);
  const rating = await findRatingWithPlace(ratingId);
  // Someone else's rating answers like a missing one, so ids reveal nothing.
  if (!rating || rating.userId !== user.id) {
    throw new AppError("NOT_FOUND", "Rating not found", 404);
  }
  // A held or hidden rating stays until an admin decides; deleting it and rating again would undo
  // the hold or the hide.
  // DECISION-PENDING: held and hidden ratings cannot be deleted by their author (no soft delete yet).
  if (rating.status !== "ACTIVE") {
    throw new AppError(
      "RATING_UNDER_REVIEW",
      "This rating is under review and cannot be deleted now",
      409,
    );
  }
  await assertRateLimit(`user:${user.id}:rating-delete`, RATE_LIMITS.ratingDelete, now);
  const rowId = await inTransaction(async (tx) => {
    // The shared lock order (restaurant → dish row → rating): a merge that moved this rating
    // meanwhile is seen, and the row recomputed below is the one it is on now.
    const row = await findRatingRow(rating.id, tx);
    if (!row) throw new AppError("NOT_FOUND", "Rating not found", 404);
    await lockRestaurantForRating(row.restaurantId, tx);
    await lockRestaurantDish(row.restaurantDishId, tx);
    // Checked again under the row lock: a hold or hide that committed meanwhile wins.
    const live = await lockRatingById(rating.id, tx);
    if (!live) throw new AppError("NOT_FOUND", "Rating not found", 404);
    if (live.restaurantDishId !== row.restaurantDishId) {
      throw new AppError("CONFLICT", "This changed at the same time elsewhere. Try again.", 409);
    }
    if (live.status !== "ACTIVE") {
      throw new AppError(
        "RATING_UNDER_REVIEW",
        "This rating is under review and cannot be deleted now",
        409,
      );
    }
    await deleteRating(live.id, tx); // its history goes with it (cascade)
    await adjustRatingCounters(user.id, { ratings: -1, photos: live.photoPath ? -1 : 0 }, tx);
    return row.restaurantDishId;
  });
  await recomputeEach([rowId], now); // the delete is committed: a failure is only logged
  logEvent("rating.delete", { userId: user.id, entityId: rating.id });
  const [page] = await listDishPagesOfRows([rowId]);
  return {
    id: rating.id,
    restaurantDishId: rowId,
    citySlug: page?.citySlug ?? rating.restaurantDish.restaurant.city.slug,
    restaurantSlug: page?.restaurantSlug ?? rating.restaurantDish.restaurant.slug,
    dishSlug: page?.dishSlug ?? rating.restaurantDish.dish.slug,
  };
}

/**
 * POST /api/v1/restaurant-dishes: a diner says the restaurant serves a dish from the canonical
 * list. Creates CANDIDATE / USER / 0.5 when absent; otherwise returns the existing row unchanged,
 * except a REMOVED one, which diners cannot bring back (409 DISH_REMOVED).
 */
export async function addRestaurantDish(
  actor: SessionUser | null,
  input: { restaurantId: string; dishId: string; menuName?: string; price?: number },
  ctx: RatingContext = {},
) {
  const now = ctx.now ?? new Date();
  const rater = await loadRater(actor);
  const restaurant = await loadRateableRestaurant(input.restaurantId, rater.id);
  const dish = await loadDish(input.dishId);
  const removed = () =>
    new AppError("DISH_REMOVED", "This restaurant no longer serves that dish", 409);
  const existing = await findRestaurantDish(restaurant.id, dish.id);
  if (existing?.status === "REMOVED") throw removed();
  if (existing) return { id: existing.id, status: existing.status, created: false };
  await assertRateLimit(`user:${rater.id}:add-dish`, RATE_LIMITS.addDish, now);
  const row = await inTransaction(async (tx) => {
    assertRateable(await lockRestaurantForRating(restaurant.id, tx), rater.id);
    return ensureRestaurantDish(
      {
        restaurantId: restaurant.id,
        dishId: dish.id,
        cityId: restaurant.cityId,
        ...USER_DISH,
        menuName: input.menuName ?? null,
        price: input.price ?? null,
      },
      tx,
    );
  });
  if (row.status === "REMOVED") throw removed();
  logEvent("restaurant_dish.add", {
    userId: rater.id,
    entityId: row.id,
    created: row.created,
  });
  return row;
}

/** /me and GET /api/v1/me/ratings: the user's own ratings, newest first, any status. */
export async function listMyRatings(actor: SessionUser | null, query: MeRatingsQuery) {
  const user = assertRole(actor, SIGNED_IN);
  const rows = await listRatingsOfUser(user.id, query.limit + 1, query.cursor);
  const page = rows.slice(0, query.limit);
  return {
    data: page.map((r) => ({
      id: r.id,
      score: r.score,
      taste: r.taste,
      portion: r.portion,
      value: r.value,
      comment: r.comment,
      photoPath: r.photoPath,
      /** HELD = under review, HIDDEN = not counted (an admin's decision). */
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      restaurantDishId: r.restaurantDish.id,
      dish: r.restaurantDish.dish,
      restaurant: {
        id: r.restaurantDish.restaurant.id,
        slug: r.restaurantDish.restaurant.slug,
        name: r.restaurantDish.restaurant.name,
        active: r.restaurantDish.restaurant.status === "ACTIVE",
        area: r.restaurantDish.restaurant.area?.name ?? null,
        city: r.restaurantDish.restaurant.city,
      },
    })),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** The user's current rating of a dish at a restaurant, to prefill /rate when editing. */
export async function findMyRating(
  actor: SessionUser | null,
  restaurantId: string,
  dishId: string,
) {
  const user = assertRole(actor, SIGNED_IN);
  const row = await findRestaurantDish(restaurantId, dishId);
  if (!row) return null;
  const rating = await findRatingOfUser(row.id, user.id);
  return rating
    ? {
        id: rating.id,
        score: rating.score,
        taste: rating.taste,
        portion: rating.portion,
        value: rating.value,
        comment: rating.comment,
        photoPath: rating.photoPath,
        status: rating.status,
      }
    : null;
}
