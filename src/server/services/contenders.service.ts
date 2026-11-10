// /admin/contenders (docs/01 D2a, 2026-11-11): one dish's list in one city, curated by hand. A dish
// row is a contender (listed on the public pages) when it ranks, has a counted rating, or its
// listing was checked by a person (public.repo CONTENDER_FILTER). Here an admin sees the list and
// the linked places the rule keeps out, adds a listed restaurant by name (which ticks the dishes
// and marks the listing checked), removes a dish from a place (REMOVED, never deleted) or puts it
// back. Every function checks the admin role itself (CLAUDE.md rule 6).
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { listCitiesWithAreas } from "@/server/repositories/geo.repo";
import { listDishRowsForCuration } from "@/server/repositories/public.repo";
import { lockRestaurantDish } from "@/server/repositories/ranking.repo";
import {
  findRestaurantDish,
  findRestaurantDishById,
  insertCandidateDish,
  listDishPagesOfRows,
  setRestaurantDishStatus,
} from "@/server/repositories/restaurant-dish.repo";
import {
  findRestaurantById,
  lockRestaurants,
  updateRestaurantById,
} from "@/server/repositories/restaurant.repo";
import { findDishesBySlugs, listLaunchDishes } from "@/server/repositories/taxonomy.repo";
import { inTransaction } from "@/server/repositories/transaction";
import { assertRole, type SessionUser } from "@/server/roles";
import type { ContenderAddInput, ContenderRowInput } from "@/server/validation";
import { checkedBy } from "./overture/auto-list";
import { recomputeEach } from "./ranking.service";
import { ADMIN_DISH } from "./restaurant.service";

type CurationRow = Awaited<ReturnType<typeof listDishRowsForCuration>>[number];

/** The rule of public.repo CONTENDER_FILTER, for rows already read. */
export function isContenderRow(row: {
  status: string;
  rankInCity: number | null;
  distinctRaters: number;
  restaurant: { status: string; autoListedAt: Date | null; checkedAt: Date | null };
}): boolean {
  return (
    row.status !== "REMOVED" &&
    row.status !== "STALE" &&
    row.restaurant.status === "ACTIVE" &&
    (row.rankInCity !== null ||
      row.distinctRaters > 0 ||
      row.restaurant.autoListedAt === null ||
      row.restaurant.checkedAt !== null)
  );
}

const shape = (r: CurationRow) => ({
  id: r.id,
  restaurantId: r.restaurant.id,
  name: r.restaurant.name,
  slug: r.restaurant.slug,
  area: r.restaurant.area?.name ?? null,
  status: r.status,
  rankInCity: r.rankInCity,
  votes: r.distinctRaters,
  score: r.score === null ? null : Number(r.score),
  /** Created by a person, or an auto-listed place an admin looked at. */
  checked: r.restaurant.autoListedAt === null || r.restaurant.checkedAt !== null,
  autoListed: r.restaurant.autoListedAt !== null,
});

export type CurationEntry = ReturnType<typeof shape>;

/** Why a linked place is not on the public list. */
function whyHidden(r: CurationRow): string {
  if (r.status === "STALE") return "stale dish row";
  if (r.restaurant.status !== "ACTIVE") return `restaurant ${r.restaurant.status.toLowerCase()}`;
  return "unchecked listing";
}

/** The page: the list as the public sees it, the linked places kept out, and the removed ones. */
export async function getContendersAdmin(
  actor: SessionUser | null,
  query: { city?: string; dish?: string },
) {
  assertRole(actor, "ADMIN");
  const [cities, dishes] = await Promise.all([listCitiesWithAreas(), listLaunchDishes()]);
  const city = cities.find((c) => c.slug === (query.city ?? cities[0]?.slug));
  const dish = dishes.find((d) => d.slug === (query.dish ?? dishes[0]?.slug));
  if (!city || !dish) throw new AppError("NOT_FOUND", "City or dish not found", 404);
  const rows = await listDishRowsForCuration(city.id, dish.id);
  const byList = (a: CurationEntry, b: CurationEntry) =>
    (a.rankInCity ?? Infinity) - (b.rankInCity ?? Infinity) ||
    b.votes - a.votes ||
    a.name.localeCompare(b.name);
  return {
    city: { id: city.id, slug: city.slug, name: city.name },
    dish: { id: dish.id, slug: dish.slug, name: dish.name },
    cities: cities.map((c) => ({ slug: c.slug, name: c.name })),
    dishes: dishes.map((d) => ({ slug: d.slug, name: d.name })),
    contenders: rows.filter(isContenderRow).map(shape).sort(byList),
    hidden: rows
      .filter((r) => !isContenderRow(r) && r.status !== "REMOVED")
      .map((r) => ({ ...shape(r), why: whyHidden(r) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    removed: rows
      .filter((r) => r.status === "REMOVED")
      .map(shape)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Puts a listed restaurant on one or more dish lists: a missing (restaurant, dish) row is created
 * (CANDIDATE, ADMIN, 0.4), a REMOVED or STALE one comes back as CANDIDATE, and the listing counts
 * as checked, because an admin chose it for a list. Rows that came back are recomputed after
 * commit: their ratings still count, so one may rank again.
 */
export async function addContenders(
  actor: SessionUser | null,
  input: ContenderAddInput,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  const wanted = [...new Set(input.dishSlugs)];
  const dishes = await findDishesBySlugs(wanted);
  if (dishes.length !== wanted.length) {
    throw new AppError("DISH_NOT_FOUND", "Pick dishes from the list", 400);
  }
  const result = await inTransaction(async (tx) => {
    // Lock order (docs/02): the restaurant, then its dish rows.
    await lockRestaurants([input.restaurantId], tx);
    const restaurant = await findRestaurantById(input.restaurantId, tx);
    if (!restaurant || restaurant.status === "DUPLICATE") {
      throw new AppError("NOT_FOUND", "Restaurant not found", 404);
    }
    if (restaurant.status !== "ACTIVE") {
      throw new AppError("RESTAURANT_INACTIVE", "Only an open restaurant can be a contender", 409);
    }
    const rows: string[] = [];
    const revived: string[] = [];
    for (const dish of dishes) {
      const existing = await findRestaurantDish(restaurant.id, dish.id, tx);
      if (!existing) {
        const created = await insertCandidateDish(
          {
            restaurantId: restaurant.id,
            dishId: dish.id,
            cityId: restaurant.cityId,
            ...ADMIN_DISH,
          },
          tx,
        );
        rows.push(created.id);
        continue;
      }
      rows.push(existing.id);
      if (existing.status === "REMOVED" || existing.status === "STALE") {
        await lockRestaurantDish(existing.id, tx);
        await setRestaurantDishStatus(existing.id, "CANDIDATE", tx);
        revived.push(existing.id);
      }
    }
    const checked = checkedBy(restaurant, now);
    if (checked.checkedAt) await updateRestaurantById(restaurant.id, checked, tx);
    return { restaurant, rows, revived };
  });
  await recomputeEach(result.revived, now); // committed: a row that fails is only logged
  logEvent("admin.contenders.add", {
    userId: admin.id,
    entityId: result.restaurant.id,
    dishSlugs: wanted,
    revived: result.revived.length,
  });
  return {
    restaurantId: result.restaurant.id,
    slug: result.restaurant.slug,
    citySlug: result.restaurant.city.slug,
    dishPages: await listDishPagesOfRows(result.rows),
  };
}

/**
 * Takes a dish off a place's list (REMOVED: it leaves the list and the ranking, its ratings stay
 * stored and it takes no new ones) or brings it back (CANDIDATE; with enough raters the recompute
 * promotes and ranks it again). The row is recomputed after commit.
 */
export async function setContenderRow(
  actor: SessionUser | null,
  input: ContenderRowInput,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  const row = await inTransaction(async (tx) => {
    const head = await findRestaurantDishById(input.restaurantDishId, tx);
    if (!head) throw new AppError("NOT_FOUND", "Dish not found", 404);
    await lockRestaurants([head.restaurantId], tx);
    const locked = await lockRestaurantDish(head.id, tx);
    if (!locked) throw new AppError("NOT_FOUND", "Dish not found", 404);
    if (input.action === "remove") {
      if (locked.status === "REMOVED") return locked;
      await setRestaurantDishStatus(locked.id, "REMOVED", tx);
    } else {
      if (locked.status !== "REMOVED") return locked;
      await setRestaurantDishStatus(locked.id, "CANDIDATE", tx);
    }
    return locked;
  });
  await recomputeEach([row.id], now);
  logEvent("admin.contenders.row", { userId: admin.id, entityId: row.id, action: input.action });
  return { id: row.id, dishPages: await listDishPagesOfRows([row.id]) };
}
