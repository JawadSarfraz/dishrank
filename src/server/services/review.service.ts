// /admin/review (docs/07 §6) for the items Phase 3 creates: held ratings (SUSPICIOUS_RATINGS with
// reason COMMENT or BURST), dish and restaurant suggestions, and panel location suggestions. Every
// decision locks the item, needs it OPEN and an action allowed for its type, changes rating status
// with plain SQL (the decay clock stays put), and recomputes the touched dish rows after commit.
// Menu items, flags, claims and duplicates arrive with their phases.
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
} from "@/server/repositories/moderation.repo";
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
import { recomputeOne } from "./ranking.service";
import { addAdminDishesTx, insertRestaurantTx, resolveDishSlugs } from "./restaurant.service";
import type { SuggestionPayload } from "./location.service";

/** The item types /admin/review handles in Phase 3. */
export const PHASE3_REVIEW_TYPES = [
  "SUSPICIOUS_RATINGS",
  "DISH_PROPOSAL",
  "RESTAURANT_PROPOSAL",
  "LOCATION_SUGGESTION",
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

// ---------- list ----------

export async function getReviewQueue(
  actor: SessionUser | null,
  query: ReviewQueueQuery,
  now: Date = new Date(),
) {
  assertRole(actor, "ADMIN");
  const types = PHASE3_REVIEW_TYPES as readonly ReviewItemType[];
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
          ? ((item.payload as HeldPayload).ratingIds ?? [])
              .map((id) => ratings.get(id))
              .filter((r): r is NonNullable<typeof r> => Boolean(r))
              .map((r) => ({
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
  input: ReviewResolveInput,
  now: Date,
  tx: Tx,
): Promise<Decision> {
  const payload = item.payload as HeldPayload;
  const ratings = await listRatingsForReview(payload.ratingIds ?? [], tx);
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
    for (const userId of users) {
      await updateUserById(userId, { bannedAt: now }, tx);
    }
    const all = await listRatingsOfUsers(users, tx);
    await setRatingStatus(
      all.filter((r) => r.status !== "HIDDEN").map((r) => r.id),
      "HIDDEN",
      tx,
    );
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

async function decideLocation(
  item: { restaurantId: string | null; payload: unknown },
  input: ReviewResolveInput,
  tx: Tx,
): Promise<Decision> {
  if (input.action !== "approve") return reject(input);
  // The item's restaurantId follows merges; the payload keeps the restaurant it was filed for.
  if (!item.restaurantId) throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  await lockRestaurants([item.restaurantId], tx);
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

/** POST /api/v1/admin/review-queue/:id/resolve. */
export async function resolveReviewItem(
  actor: SessionUser | null,
  itemId: string,
  input: ReviewResolveInput,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  const decision = await inTransaction(async (tx) => {
    const item = await lockReviewItem(itemId, tx);
    if (!item) throw new AppError("NOT_FOUND", "Review item not found", 404);
    if (item.status !== "OPEN") {
      throw new AppError("ITEM_CLOSED", "This item was already decided", 409);
    }
    if (!(PHASE3_REVIEW_TYPES as readonly ReviewItemType[]).includes(item.type)) {
      throw new AppError("NOT_AVAILABLE", "This review type arrives in a later phase", 400);
    }
    if (!isReviewActionAllowed(item.type, input.action)) {
      throw new AppError("ACTION_NOT_ALLOWED", "That action does not fit this item", 400);
    }
    const d =
      item.type === "SUSPICIOUS_RATINGS"
        ? await decideHeldRatings(item, input, now, tx)
        : item.type === "DISH_PROPOSAL"
          ? await decideDishProposal(input, tx)
          : item.type === "RESTAURANT_PROPOSAL"
            ? await decideRestaurantProposal(input, tx)
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
      },
      tx,
    );
    return { ...d, type: item.type };
  });

  // After commit: trust first (it changes weights), then every touched dish row.
  const rows = new Set(decision.recompute);
  for (const userId of decision.trustUsers) await refreshUserTrust(userId);
  for (const row of rows) await recomputeOne(row, now);
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
  };
}
