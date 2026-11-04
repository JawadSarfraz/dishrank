// The owner area (docs/07 §4 step 3, Phase 6): for the restaurants a user manages, confirm dishes
// (OWNER_VERIFIED), remove them (REMOVED, logged), fix menu names and prices, upload menus (the
// restaurant page's button) and a basic report from the weekly ranking snapshots. Owners never see
// who rated and never edit, hide or score ratings. An admin may open any restaurant's owner page.
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import {
  findDishRowWithOwner,
  findRestaurantForOwner,
  listDishRowsForOwner,
  listRestaurantsManagedBy,
  listSnapshotsOfDishes,
} from "@/server/repositories/owner.repo";
import {
  listDishPagesOfRows,
  updateDishRowFromMenu,
} from "@/server/repositories/restaurant-dish.repo";
import { lockRestaurantDish } from "@/server/repositories/ranking.repo";
import { lockRestaurantForRating } from "@/server/repositories/restaurant.repo";
import { inTransaction } from "@/server/repositories/transaction";
import { assertRole, type SessionUser } from "@/server/roles";
import type { OwnerDishInput } from "@/server/validation";
import { DAY_MS } from "./ranking.constants";
import { recomputeEach } from "./ranking.service";

const OWNER_ROLES = ["OWNER", "ADMIN"] as const;

/** How many weekly snapshots the report shows. */
export const OWNER_REPORT_WEEKS = 12;

/** The owner may manage it: the restaurant's claimed owner, or an admin. Anyone else: 404. */
function assertManages(user: SessionUser, restaurant: { claimedByUserId: string | null } | null) {
  if (!restaurant || (user.role !== "ADMIN" && restaurant.claimedByUserId !== user.id)) {
    throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  }
}

/** /owner: the restaurants this user manages. */
export async function listMyRestaurants(actor: SessionUser | null) {
  const user = assertRole(actor, OWNER_ROLES);
  return listRestaurantsManagedBy(user.id);
}

type SnapshotEntry = {
  restaurantDishId: string;
  rank: number | null;
  score: number | null;
  votes: number;
};

/**
 * /owner/restaurants/[id]: the dish rows (status, menu name, price, score, votes, rank) and, per
 * dish, its place in each weekly snapshot of the last 12 weeks (absent = not ranked that week).
 */
export async function getOwnerRestaurant(
  actor: SessionUser | null,
  restaurantId: string,
  now: Date = new Date(),
) {
  const user = assertRole(actor, OWNER_ROLES);
  const restaurant = await findRestaurantForOwner(restaurantId);
  assertManages(user, restaurant);
  if (restaurant!.status === "DUPLICATE")
    throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  const rows = await listDishRowsForOwner(restaurant!.id);
  const since = new Date(now.getTime() - OWNER_REPORT_WEEKS * 7 * DAY_MS);
  const snapshots = await listSnapshotsOfDishes(
    restaurant!.cityId,
    rows.map((r) => r.dish.id),
    since,
  );
  const dishes = rows.map((r) => ({
    ...r,
    score: r.score === null ? null : Number(r.score),
    history: snapshots
      .filter((s) => s.dishId === r.dish.id)
      .map((s) => {
        const entry = (s.payload as SnapshotEntry[]).find((e) => e.restaurantDishId === r.id);
        return {
          at: s.computedAt,
          rank: entry?.rank ?? null,
          score: entry?.score ?? null,
          votes: entry?.votes ?? null,
        };
      }),
  }));
  return {
    restaurant: restaurant!,
    dishes: dishes.filter((d) => d.status !== "REMOVED"),
    removed: dishes.filter((d) => d.status === "REMOVED"),
  };
}

/** Rows an owner may confirm or edit; a REMOVED row only an admin brings back (docs/06). */
const EDITABLE = new Set([
  "CANDIDATE",
  "USER_CONFIRMED",
  "MENU_VERIFIED",
  "OWNER_VERIFIED",
  "STALE",
]);

/**
 * An owner's change to one dish row of their restaurant: confirm (OWNER_VERIFIED), remove
 * (REMOVED, logged with the reason) or fix the menu name and price (which also confirms it, so a
 * later menu photo never overwrites the owner's values). The restaurant is share-locked, then the
 * row; the row is recomputed after commit (its status decides eligibility).
 */
export async function updateOwnerDish(
  actor: SessionUser | null,
  rowId: string,
  input: OwnerDishInput,
  now: Date = new Date(),
) {
  const user = assertRole(actor, OWNER_ROLES);
  const row = await inTransaction(async (tx) => {
    const peek = await findDishRowWithOwner(rowId, tx);
    if (!peek) throw new AppError("NOT_FOUND", "Dish not found", 404);
    const restaurant = await lockRestaurantForRating(peek.restaurantId, tx);
    assertManages(user, restaurant);
    const locked = await lockRestaurantDish(rowId, tx);
    if (!locked || locked.restaurantId !== peek.restaurantId) {
      throw new AppError("NOT_FOUND", "Dish not found", 404);
    }
    if (!EDITABLE.has(locked.status)) {
      throw new AppError("DISH_REMOVED", "This dish was removed; ask us to bring it back", 409);
    }
    let data: Prisma.RestaurantDishUncheckedUpdateInput;
    if (input.action === "remove") {
      data = { status: "REMOVED" };
    } else if (input.action === "confirm") {
      data = { status: "OWNER_VERIFIED", lastVerifiedAt: now };
    } else {
      // DECISION-PENDING: fixing a name or price also confirms the dish (a menu photo never overwrites it).
      data = {
        status: "OWNER_VERIFIED",
        lastVerifiedAt: now,
        menuName: input.menuName,
        price: input.price,
      };
    }
    await updateDishRowFromMenu(rowId, data, tx);
    return { id: rowId, from: locked.status, to: data.status as string };
  });
  await recomputeEach([row.id], now);
  logEvent("owner.dish." + input.action, {
    userId: user.id,
    entityId: row.id,
    from: row.from,
    to: row.to,
    ...(input.action === "remove" ? { reason: input.reason ?? null } : {}),
  });
  return { id: row.id, status: row.to, dishPages: await listDishPagesOfRows([row.id]) };
}
