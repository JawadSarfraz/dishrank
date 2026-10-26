// /admin/review (docs/07 §6) for the items Phase 3 creates: held ratings (SUSPICIOUS_RATINGS with
// reason COMMENT or BURST), dish and restaurant suggestions, and panel location suggestions. Every
// decision takes the item's locks in the shared order (restaurant → dish rows → item), needs it
// OPEN, unchanged since the admin saw it (fingerprint) and an action allowed for its type, changes
// rating status with plain SQL (the decay clock stays put), and recomputes the touched dish rows
// after commit. Menu items, flags, claims and duplicates arrive with their phases.
import { createHash } from "node:crypto";
import type { Prisma, ReviewItemType } from "@/generated/prisma/client";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { findAreaById, findCityWithAreasById } from "@/server/repositories/geo.repo";
import {
  closeReviewItem,
  countOpenReviewItems,
  listRatingIdsInOtherOpenItems,
  listReviewItemsPage,
  lockReviewItem,
  peekReviewItem,
} from "@/server/repositories/moderation.repo";
import { listDishGroupsOfRows, lockCityDishLists } from "@/server/repositories/ranking.repo";
import {
  listDishPagesOfRows,
  lockRestaurantDishes,
} from "@/server/repositories/restaurant-dish.repo";
import {
  listRatingsForReview,
  listRatingsOfUsers,
  setRatingStatus,
} from "@/server/repositories/rating.repo";
import {
  findRestaurantById,
  lockRestaurants,
  updateRestaurantById,
} from "@/server/repositories/restaurant.repo";
import {
  findDishById,
  findDishBySlug,
  findDishCategory,
  findTakenAliases,
  insertDishWithAliases,
  listDishesForPicker,
  listDishCategories,
} from "@/server/repositories/taxonomy.repo";
import { inTransaction, type Tx } from "@/server/repositories/transaction";
import { updateUserById } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import {
  isReviewActionAllowed,
  type ReviewQueueQuery,
  type ReviewResolveInput,
} from "@/server/validation";
import { refreshUserTrust } from "./admin-users.service";
import { invalidateAliasIndex } from "./matching/aliases";
import { normalize } from "./matching/normalize";
import { recomputeEach } from "./ranking.service";
import { addAdminDishesTx, insertRestaurantTx, resolveDishSlugs } from "./restaurant.service";
import type { SuggestionPayload } from "./location.service";

/** The item types /admin/review handles (menu items, claims and duplicates arrive later). */
export const REVIEW_PAGE_TYPES = [
  "SUSPICIOUS_RATINGS",
  "DISH_PROPOSAL",
  "RESTAURANT_PROPOSAL",
  "LOCATION_SUGGESTION",
  "FLAG",
] as const satisfies readonly ReviewItemType[];

type HeldPayload = {
  restaurantDishId: string;
  ratingIds: string[];
  reason: string;
  flags?: string[];
};
type RestaurantProposalPayload = {
  name: string;
  cityId: string;
  areaId: string;
  note: string | null;
};

/**
 * What an admin sees of an item: its payload, its restaurant and the listed ratings' state (an edit
 * moves `updatedAt`, a decision changes `status`). A decision sent with an older fingerprint is
 * refused, so it never applies to ratings or a location the admin did not see.
 */
export function reviewFingerprint(
  item: { payload: unknown; restaurantId: string | null },
  ratings: readonly { id: string; status: string; updatedAt: Date }[],
  /** A location card also shows the restaurant's current location, which approving replaces. */
  location: { lat: number | null; lng: number | null; locationSource: string | null } | null = null,
): string {
  const state = [...ratings]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => [r.id, r.status, r.updatedAt.toISOString()]);
  const place = location ? [location.lat, location.lng, location.locationSource] : null;
  return createHash("sha256")
    .update(JSON.stringify([item.payload, item.restaurantId, state, place]))
    .digest("hex")
    .slice(0, 32);
}

const listedRatings = <T extends { id: string }>(payload: unknown, byId: Map<string, T>) =>
  ((payload as HeldPayload).ratingIds ?? [])
    .map((id) => byId.get(id))
    .filter((r): r is T => Boolean(r));

// ---------- list ----------

export async function getReviewQueue(
  actor: SessionUser | null,
  query: ReviewQueueQuery,
  now: Date = new Date(),
) {
  assertRole(actor, "ADMIN");
  const types = REVIEW_PAGE_TYPES as readonly ReviewItemType[];
  if (query.type && !types.includes(query.type)) {
    throw new AppError("NOT_AVAILABLE", "This review type arrives in a later phase", 400);
  }
  const status = query.status === "OPEN" || query.status === "REJECTED" ? query.status : "RESOLVED";
  const rows = await listReviewItemsPage({
    type: query.type,
    types,
    status,
    take: query.limit + 1,
    cursor: query.cursor,
  });
  const page = rows.slice(0, query.limit);
  const ratingIds = page.flatMap((item) =>
    item.type === "SUSPICIOUS_RATINGS" ? ((item.payload as HeldPayload).ratingIds ?? []) : [],
  );
  const ratings = new Map((await listRatingsForReview(ratingIds)).map((r) => [r.id, r]));
  const [counts, categories, dishes] = await Promise.all([
    countOpenReviewItems(types),
    listDishCategories(),
    listDishesForPicker(),
  ]);
  const areaNames = new Map<string, string>();
  for (const item of page) {
    if (item.type !== "RESTAURANT_PROPOSAL") continue;
    const p = item.payload as RestaurantProposalPayload;
    const area = await findAreaById(p.areaId);
    if (area) areaNames.set(p.areaId, area.name);
  }
  return {
    counts,
    categories,
    dishes,
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    items: page.map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      fingerprint: reviewFingerprint(
        item,
        item.type === "SUSPICIOUS_RATINGS" ? listedRatings(item.payload, ratings) : [],
        item.type === "LOCATION_SUGGESTION" ? item.restaurant : null,
      ),
      createdAt: item.createdAt,
      resolution: item.resolution,
      resolvedAt: item.resolvedAt,
      resolvedBy: item.resolvedBy?.email ?? null,
      createdBy: item.createdBy,
      restaurant: item.restaurant,
      dish: item.dish,
      payload: item.payload as Prisma.JsonObject,
      areaName:
        item.type === "RESTAURANT_PROPOSAL"
          ? (areaNames.get((item.payload as RestaurantProposalPayload).areaId) ?? null)
          : null,
      // Ratings a merge or a delete removed are simply missing here.
      ratings:
        item.type === "SUSPICIOUS_RATINGS"
          ? listedRatings(item.payload, ratings).map((r) => ({
              ...r,
              accountDays: Math.floor((now.getTime() - r.user.createdAt.getTime()) / 86_400_000),
            }))
          : [],
    })),
  };
}

export type ReviewQueue = Awaited<ReturnType<typeof getReviewQueue>>;

// ---------- resolve ----------

type Decision = {
  status: "RESOLVED" | "REJECTED";
  resolution: string;
  restaurantId?: string;
  dishId?: string;
  /** Dish rows to recompute after commit. */
  recompute: string[];
  /** Users whose trust follows the docs/04 table after commit. */
  trustUsers: string[];
  invalidateAliases?: boolean;
  /** Restaurant pages to revalidate. */
  restaurantSlugs: { citySlug: string; slug: string }[];
  /** The item's payload as it is closed (a release records which ratings it set ACTIVE). */
  payload?: Prisma.InputJsonValue;
};

const reject = (input: ReviewResolveInput): Decision => ({
  status: "REJECTED",
  resolution: `rejected${
    input.action === "reject" && input.payload?.reason ? `: ${input.payload.reason}` : ""
  }`,
  recompute: [],
  trustUsers: [],
  restaurantSlugs: [],
});

async function decideHeldRatings(
  item: { id: string; payload: unknown },
  ratings: readonly { id: string; status: string; userId: string; restaurantDishId: string }[],
  /** The dish rows locked before the item (lockItemParents). */
  lockedRows: ReadonlySet<string>,
  input: ReviewResolveInput,
  now: Date,
  tx: Tx,
): Promise<Decision> {
  const payload = item.payload as HeldPayload;
  const rows = [...new Set(ratings.map((r) => r.restaurantDishId))];
  const users = [...new Set(ratings.map((r) => r.userId))];
  if (input.action === "release") {
    // A rating also listed in another open item (a burst and a comment) waits for that one too.
    const elsewhere = new Set<string>();
    for (const row of rows) {
      for (const id of await listRatingIdsInOtherOpenItems(row, item.id, tx)) elsewhere.add(id);
    }
    const release = ratings.filter((r) => r.status === "HELD" && !elsewhere.has(r.id));
    await setRatingStatus(
      release.map((r) => r.id),
      "ACTIVE",
      tx,
    );
    return {
      status: "RESOLVED",
      resolution: `released ${release.length}`,
      recompute: rows,
      trustUsers: [],
      restaurantSlugs: [],
      // Only these are "released" for the burst rule; the ones left HELD wait for their other item.
      payload: { ...payload, releasedRatingIds: release.map((r) => r.id) },
    };
  }
  if (input.action === "hide") {
    const hide = ratings.filter((r) => r.status !== "HIDDEN");
    await setRatingStatus(
      hide.map((r) => r.id),
      "HIDDEN",
      tx,
    );
    // docs/07 §6 "lower trust": the docs/04 table drops trust to 0.3 at 2 hidden ratings.
    return {
      status: "RESOLVED",
      resolution: `hidden ${hide.length}`,
      recompute: rows,
      trustUsers: users,
      restaurantSlugs: [],
    };
  }
  if (input.action === "ban_users") {
    // The ratings first, then the user rows in id order: the order every other writer uses
    // (docs/02 Concurrency), so a ban never deadlocks with an edit, a delete or a merge.
    const all = await listRatingsOfUsers(users, tx);
    // A rating saved or moved since the rows were locked is on a row this decision does not hold:
    // nothing is decided, the admin tries again (and the next try locks that row too).
    if (all.some((r) => !lockedRows.has(r.restaurantDishId))) throw itemChanged();
    await setRatingStatus(
      all.filter((r) => r.status !== "HIDDEN").map((r) => r.id),
      "HIDDEN",
      tx,
    );
    for (const userId of [...users].sort()) {
      await updateUserById(userId, { bannedAt: now }, tx);
    }
    return {
      status: "RESOLVED",
      resolution: `banned ${users.length}`,
      recompute: [...new Set(all.map((r) => r.restaurantDishId))],
      trustUsers: [],
      restaurantSlugs: [],
    };
  }
  throw new AppError("ACTION_NOT_ALLOWED", "That action does not fit this item", 400);
}

async function decideDishProposal(input: ReviewResolveInput, tx: Tx): Promise<Decision> {
  if (input.action === "create_dish") {
    const { dish } = input.payload;
    if (await findDishBySlug(dish.slug, tx)) {
      throw new AppError("DISH_EXISTS", `A dish with the slug "${dish.slug}" exists`, 409);
    }
    if (!(await findDishCategory(dish.categoryId, tx))) {
      throw new AppError("NOT_FOUND", "Unknown dish category", 404);
    }
    // docs/05: the name and every alias are stored normalised, one row per spelling.
    const aliases = [...new Set([dish.name, ...dish.aliases].map(normalize).filter(Boolean))];
    const taken = await findTakenAliases(aliases, tx);
    if (taken.length > 0) {
      throw new AppError(
        "ALIAS_TAKEN",
        `Already used by another dish: ${taken.map((t) => `"${t.alias}" (${t.dish.slug})`).join(", ")}`,
        409,
      );
    }
    const created = await insertDishWithAliases({ ...dish, aliases }, tx);
    return {
      status: "RESOLVED",
      resolution: `created dish ${created.slug}`,
      dishId: created.id,
      recompute: [],
      trustUsers: [],
      invalidateAliases: true,
      restaurantSlugs: [],
    };
  }
  if (input.action === "map_to_dish") {
    const dish = await findDishById(input.payload.dishId, tx);
    if (!dish) throw new AppError("NOT_FOUND", "Dish not found", 404);
    return {
      status: "RESOLVED",
      resolution: `mapped to ${dish.slug}`,
      dishId: dish.id,
      recompute: [],
      trustUsers: [],
      restaurantSlugs: [],
    };
  }
  return reject(input);
}

async function decideRestaurantProposal(input: ReviewResolveInput, tx: Tx): Promise<Decision> {
  if (input.action === "create_restaurant") {
    const r = input.payload.restaurant;
    const dishIds = await resolveDishSlugs(r.dishSlugs);
    const created = await insertRestaurantTx(
      {
        name: r.name,
        areaId: r.areaId,
        address: r.address,
        phone: r.phone,
        website: r.website,
        priceBand: r.priceBand,
        aliases: r.aliases,
        source: "MANUAL",
        location:
          r.lat !== undefined && r.lng !== undefined
            ? { lat: r.lat, lng: r.lng, source: "ADMIN" }
            : null,
      },
      tx,
    );
    await addAdminDishesTx(created, dishIds, tx);
    const city = await findCityWithAreasById(created.cityId, tx);
    return {
      status: "RESOLVED",
      resolution: `created restaurant ${created.slug}`,
      restaurantId: created.id,
      recompute: [],
      trustUsers: [],
      restaurantSlugs: city ? [{ citySlug: city.slug, slug: created.slug }] : [],
    };
  }
  if (input.action === "link_restaurant") {
    const restaurant = await findRestaurantById(input.payload.restaurantId, tx);
    if (!restaurant || restaurant.status === "DUPLICATE") {
      throw new AppError("NOT_FOUND", "Restaurant not found", 404);
    }
    return {
      status: "RESOLVED",
      resolution: `linked to ${restaurant.slug}`,
      restaurantId: restaurant.id,
      recompute: [],
      trustUsers: [],
      restaurantSlugs: [],
    };
  }
  return reject(input);
}

/**
 * Problem reports and disputes (FLAG items with payload.kind "report" or "dispute"): the admin acts
 * by hand (close the restaurant, fix its location or dishes on /admin/restaurants) and marks the
 * item done, or dismisses it. Dish flags with automatic effects arrive in Phase 5.
 */
function decideFlag(input: ReviewResolveInput): Decision {
  const closed = { recompute: [], trustUsers: [], restaurantSlugs: [] };
  return input.action === "uphold"
    ? { status: "RESOLVED", resolution: "done", ...closed }
    : { status: "REJECTED", resolution: "dismissed", ...closed };
}

async function decideLocation(
  item: { restaurantId: string | null; payload: unknown },
  input: ReviewResolveInput,
  tx: Tx,
): Promise<Decision> {
  if (input.action !== "approve") return reject(input);
  // The item's restaurantId follows merges; the payload keeps the restaurant it was filed for. Its
  // row lock was taken before the item's (resolveReviewItem).
  if (!item.restaurantId) throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  const restaurant = await findRestaurantById(item.restaurantId, tx);
  if (!restaurant || restaurant.status === "DUPLICATE") {
    throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  }
  const { best } = item.payload as SuggestionPayload;
  await updateRestaurantById(
    restaurant.id,
    { lat: best.lat, lng: best.lng, locationSource: "PANEL_GPS" },
    tx,
  );
  return {
    status: "RESOLVED",
    resolution: `location set from a panel observation (±${Math.round(best.accuracyM)} m)`,
    recompute: [],
    trustUsers: [],
    restaurantSlugs: [{ citySlug: restaurant.city.slug, slug: restaurant.slug }],
  };
}

const itemChanged = () =>
  new AppError(
    "ITEM_CHANGED",
    "This item changed after you opened it. Reload to see it as it is now.",
    409,
  );

/**
 * Takes the locks that come before an item's own (restaurant → dish rows → item, the order rating
 * writes, merges and panel locations use): the dish rows of a held-ratings item, the restaurant of
 * a location suggestion. Returns what it locked, to check after the item lock.
 */
async function lockItemParents(
  item: { type: ReviewItemType; payload: unknown; restaurantId: string | null },
  action: ReviewResolveInput["action"],
  tx: Tx,
) {
  if (item.type === "SUSPICIOUS_RATINGS") {
    const payload = item.payload as HeldPayload;
    const ratings = await listRatingsForReview(payload.ratingIds ?? [], tx);
    const rows = [payload.restaurantDishId, ...ratings.map((r) => r.restaurantDishId)];
    // A ban hides every rating of its users: the dish rows of all of them are locked too.
    if (action === "ban_users") {
      const users = [...new Set(ratings.map((r) => r.userId))];
      for (const r of await listRatingsOfUsers(users, tx)) rows.push(r.restaurantDishId);
    }
    // Their (city, dish) lists first, then the rows (docs/02): a decision never deadlocks with a
    // recompute that re-ranks one of these lists.
    await lockCityDishLists(await listDishGroupsOfRows(rows, tx), tx);
    await lockRestaurantDishes(rows, tx);
    return { rows: new Set(rows), restaurantId: null };
  }
  if (item.type === "LOCATION_SUGGESTION" && item.restaurantId) {
    await lockRestaurants([item.restaurantId], tx);
    return { rows: new Set<string>(), restaurantId: item.restaurantId };
  }
  return { rows: new Set<string>(), restaurantId: null };
}

/** POST /api/v1/admin/review-queue/:id/resolve. */
export async function resolveReviewItem(
  actor: SessionUser | null,
  itemId: string,
  input: ReviewResolveInput,
  now: Date = new Date(),
  /** The fingerprint the admin saw (getReviewQueue); without one the item is decided as it is. */
  fingerprint?: string,
) {
  const admin = assertRole(actor, "ADMIN");
  const decision = await inTransaction(async (tx) => {
    const peek = await peekReviewItem(itemId, tx);
    if (!peek) throw new AppError("NOT_FOUND", "Review item not found", 404);
    const locked = peek.status === "OPEN" ? await lockItemParents(peek, input.action, tx) : null;
    const item = await lockReviewItem(itemId, tx);
    if (!item) throw new AppError("NOT_FOUND", "Review item not found", 404);
    if (item.status !== "OPEN" || !locked) {
      throw new AppError("ITEM_CLOSED", "This item was already decided", 409);
    }
    if (!(REVIEW_PAGE_TYPES as readonly ReviewItemType[]).includes(item.type)) {
      throw new AppError("NOT_AVAILABLE", "This review type arrives in a later phase", 400);
    }
    if (!isReviewActionAllowed(item.type, input.action)) {
      throw new AppError("ACTION_NOT_ALLOWED", "That action does not fit this item", 400);
    }
    // Under the locks: the item's ratings and restaurant must be the ones locked (a merge that
    // committed in between moves them), and the item must be what the admin saw.
    const ratings =
      item.type === "SUSPICIOUS_RATINGS"
        ? await listRatingsForReview((item.payload as HeldPayload).ratingIds ?? [], tx)
        : [];
    if (
      (item.type === "SUSPICIOUS_RATINGS" &&
        ![
          (item.payload as HeldPayload).restaurantDishId,
          ...ratings.map((r) => r.restaurantDishId),
        ].every((row) => locked.rows.has(row))) ||
      (item.type === "LOCATION_SUGGESTION" && item.restaurantId !== locked.restaurantId)
    ) {
      throw itemChanged();
    }
    const location =
      item.type === "LOCATION_SUGGESTION" && item.restaurantId
        ? await findRestaurantById(item.restaurantId, tx)
        : null;
    if (fingerprint !== undefined && fingerprint !== reviewFingerprint(item, ratings, location)) {
      throw itemChanged();
    }
    const d =
      item.type === "SUSPICIOUS_RATINGS"
        ? await decideHeldRatings(item, ratings, locked.rows, input, now, tx)
        : item.type === "DISH_PROPOSAL"
          ? await decideDishProposal(input, tx)
          : item.type === "RESTAURANT_PROPOSAL"
            ? await decideRestaurantProposal(input, tx)
            : item.type === "FLAG"
              ? decideFlag(input)
              : await decideLocation(item, input, tx);
    await closeReviewItem(
      item.id,
      {
        status: d.status,
        resolution: d.resolution,
        resolvedByUserId: admin.id,
        resolvedAt: now,
        ...(d.restaurantId ? { restaurantId: d.restaurantId } : {}),
        ...(d.dishId ? { dishId: d.dishId } : {}),
        ...(d.payload !== undefined ? { payload: d.payload } : {}),
      },
      tx,
    );
    return { ...d, type: item.type };
  });

  // After commit: trust first (it changes weights; it recomputes the user's rows itself), then
  // every dish row the decision touched. Pages of both kinds of rows are revalidated.
  const rows = new Set(decision.recompute);
  const pages = new Set(decision.recompute);
  for (const userId of decision.trustUsers) {
    for (const row of (await refreshUserTrust(userId))?.rows ?? []) pages.add(row);
  }
  await recomputeEach(rows, now); // the decision is committed: a failure is only logged
  if (decision.invalidateAliases) invalidateAliasIndex();
  logEvent("admin.review.resolve", {
    userId: admin.id,
    entityId: itemId,
    type: decision.type,
    action: input.action,
    status: decision.status,
    recomputedRows: rows.size,
  });
  return {
    id: itemId,
    status: decision.status,
    resolution: decision.resolution,
    restaurantSlugs: decision.restaurantSlugs,
    /** Ranking and restaurant pages whose scores or ranks may have changed. */
    dishPages: await listDishPagesOfRows([...pages]),
  };
}
