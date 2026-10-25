// Pure planning for RestaurantService.mergeRestaurants (docs/07 §2 "Merging duplicate restaurants").
// The service loads rows inside one transaction, asks these functions what to do, then applies it.
import type { FlagReason, RestaurantDishStatus } from "@/generated/prisma/enums";

/** docs/07 §2: OWNER_VERIFIED > MENU_VERIFIED > USER_CONFIRMED > CANDIDATE > STALE > REMOVED. */
export const DISH_STATUS_STRENGTH: Record<RestaurantDishStatus, number> = {
  OWNER_VERIFIED: 5,
  MENU_VERIFIED: 4,
  USER_CONFIRMED: 3,
  CANDIDATE: 2,
  STALE: 1,
  REMOVED: 0,
};

export type MergeDish = {
  id: string;
  dishId: string;
  status: RestaurantDishStatus;
  distinctRaters: number;
  price: number | null;
  variantTags: string[];
};

export type DishPair = {
  dishId: string;
  keep: MergeDish;
  drop: MergeDish;
  /** The kept row belongs to the source and moves to the target after the dropped row is deleted. */
  keepFromSource: boolean;
  /** The lower non-null price of the two rows. */
  price: number | null;
  /** Union of both rows' tags, kept row's first. */
  variantTags: string[];
};

export type DishMergePlan = { move: MergeDish[]; pairs: DishPair[] };

/**
 * Source dishes the target lacks move over. When both serve a dish, keep the stronger row (status
 * order, then more distinct raters; a full tie keeps the target's row).
 */
export function planDishMerge(
  source: readonly MergeDish[],
  target: readonly MergeDish[],
): DishMergePlan {
  const targetByDish = new Map(target.map((rd) => [rd.dishId, rd]));
  const plan: DishMergePlan = { move: [], pairs: [] };
  for (const s of source) {
    const t = targetByDish.get(s.dishId);
    if (!t) {
      plan.move.push(s);
      continue;
    }
    const byStatus = DISH_STATUS_STRENGTH[s.status] - DISH_STATUS_STRENGTH[t.status];
    const sourceWins = byStatus > 0 || (byStatus === 0 && s.distinctRaters > t.distinctRaters);
    const [keep, drop] = sourceWins ? [s, t] : [t, s];
    plan.pairs.push({
      dishId: s.dishId,
      keep,
      drop,
      keepFromSource: sourceWins,
      price: lowerPrice(keep.price, drop.price),
      variantTags: [...new Set([...keep.variantTags, ...drop.variantTags])],
    });
  }
  return plan;
}

function lowerPrice(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

export type MergeRating = {
  id: string;
  userId: string;
  score: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RatingMergePlan = {
  /** The same user rated both rows: keep the newer (updatedAt); the older goes into its history. */
  collisions: { kept: MergeRating; older: MergeRating }[];
  /** Ratings on the dropped row that move to the kept row (newer collision winners included). */
  move: MergeRating[];
};

/** One rating per user per kept row (docs/07 §2 step 2). An updatedAt tie keeps the kept row's rating. */
export function planRatingMerge(
  keepRow: readonly MergeRating[],
  dropRow: readonly MergeRating[],
): RatingMergePlan {
  const keptByUser = new Map(keepRow.map((r) => [r.userId, r]));
  const plan: RatingMergePlan = { collisions: [], move: [] };
  for (const d of dropRow) {
    const k = keptByUser.get(d.userId);
    if (!k) {
      plan.move.push(d);
    } else if (d.updatedAt.getTime() > k.updatedAt.getTime()) {
      plan.collisions.push({ kept: d, older: k });
      plan.move.push(d);
    } else {
      plan.collisions.push({ kept: k, older: d });
    }
  }
  return plan;
}

export type MergeFlag = { id: string; userId: string; reason: FlagReason };

/** Flags move to the kept row unless the same user already flagged it for the same reason (step 3). */
export function planFlagMerge(
  keepRow: readonly MergeFlag[],
  dropRow: readonly MergeFlag[],
): { move: string[]; drop: string[] } {
  const taken = new Set(keepRow.map((f) => `${f.userId}:${f.reason}`));
  const plan = { move: [] as string[], drop: [] as string[] };
  for (const f of dropRow) {
    const key = `${f.userId}:${f.reason}`;
    if (taken.has(key)) plan.drop.push(f.id);
    else {
      taken.add(key);
      plan.move.push(f.id);
    }
  }
  return plan;
}

/** Owner claims move to the target; a claim by a user who already claimed the target is dropped (step 4). */
export function planClaimMerge(
  targetClaims: readonly { id: string; userId: string }[],
  sourceClaims: readonly { id: string; userId: string }[],
): { move: string[]; drop: string[] } {
  const claimed = new Set(targetClaims.map((c) => c.userId));
  const plan = { move: [] as string[], drop: [] as string[] };
  for (const c of sourceClaims) {
    if (claimed.has(c.userId)) plan.drop.push(c.id);
    else {
      claimed.add(c.userId);
      plan.move.push(c.id);
    }
  }
  return plan;
}

/**
 * Step 4: different owners on both → conflict; only the source claimed → its owner moves to the
 * target; the same owner on both, or none → nothing moves.
 */
export function planOwnerMerge(
  sourceOwnerId: string | null,
  targetOwnerId: string | null,
): { conflict: boolean; moveToTarget: boolean } {
  if (sourceOwnerId && targetOwnerId && sourceOwnerId !== targetOwnerId) {
    return { conflict: true, moveToTarget: false };
  }
  return { conflict: false, moveToTarget: Boolean(sourceOwnerId && !targetOwnerId) };
}
