// pnpm dev:demo (scripts/dev-demo.ts): reads and deletes for the local demo data. Demo users are
// marked by their e-mail domain; restaurants are found through the "dev-demo" job records, the
// candidates the demo admin reviewed and the suggestions demo users filed.
import type { Role } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Tx } from "./transaction";

export async function listUsersByEmailDomain(domain: string) {
  return db.user.findMany({
    where: { email: { endsWith: `@${domain}` } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true },
  });
}

export async function insertDemoUser(data: {
  email: string;
  name: string;
  role: Role;
  isPanel: boolean;
  trustScore: number;
  createdAt: Date;
}) {
  return db.user.create({ data, select: { id: true, email: true, name: true, role: true } });
}

/** NEW candidates with a location in the given areas of one city, most confident first. */
export async function listNewLocatedCandidates(citySlug: string, areaSlugs: readonly string[]) {
  return db.overtureCandidate.findMany({
    where: {
      status: "NEW",
      lat: { not: null },
      lng: { not: null },
      city: { slug: citySlug },
      suggestedArea: { slug: { in: [...areaSlugs] } },
    },
    orderBy: [{ confidence: "desc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
      website: true,
      category: true,
      alternates: true,
      confidence: true,
      lat: true,
      lng: true,
      suggestedAreaId: true,
      suggestedArea: { select: { slug: true, name: true } },
      city: { select: { id: true, name: true } },
    },
  });
}

export async function listDishRowsOfRestaurants(restaurantIds: readonly string[]) {
  return db.restaurantDish.findMany({
    where: { restaurantId: { in: [...restaurantIds] } },
    orderBy: [{ restaurantId: "asc" }, { dishId: "asc" }],
    select: {
      id: true,
      restaurantId: true,
      cityId: true,
      dishId: true,
      status: true,
      distinctRaters: true,
      score: true,
      rankInCity: true,
      dish: { select: { slug: true, name: true } },
      restaurant: { select: { slug: true, name: true } },
    },
  });
}

/** Ratings of the given users, and how many of them are held for review. */
export async function countRatingsOfUsers(userIds: readonly string[]) {
  const [total, held] = await Promise.all([
    db.rating.count({ where: { userId: { in: [...userIds] } } }),
    db.rating.count({ where: { userId: { in: [...userIds] }, status: "HELD" } }),
  ]);
  return { total, held };
}

/**
 * Restaurants that came from demo data: recorded by a run, created from a suggestion a demo user
 * filed, or (when a run died before recording) created from a candidate the demo admin reviewed
 * and still named with the demo mark. A merge moves candidates to the surviving restaurant, so a
 * real restaurant can point back at a demo candidate: the mark keeps it out. Only ones that exist.
 */
export async function findDemoRestaurantIds(
  recorded: readonly string[],
  demoUserIds: readonly string[],
  nameMark: string,
) {
  const [fromCandidates, fromSuggestions] = await Promise.all([
    db.overtureCandidate.findMany({
      where: {
        reviewedByUserId: { in: [...demoUserIds] },
        restaurant: { name: { endsWith: nameMark } },
      },
      select: { restaurantId: true },
    }),
    db.reviewItem.findMany({
      where: {
        createdByUserId: { in: [...demoUserIds] },
        type: "RESTAURANT_PROPOSAL",
        resolution: { startsWith: "created restaurant " },
        restaurantId: { not: null },
      },
      select: { restaurantId: true },
    }),
  ]);
  const ids = new Set([
    ...recorded,
    ...fromCandidates.map((c) => c.restaurantId!),
    ...fromSuggestions.map((i) => i.restaurantId!),
  ]);
  const existing = await db.restaurant.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true },
  });
  return existing.map((r) => r.id);
}

/**
 * Merges between a demo restaurant and one that is not: a demo restaurant merged into a real one,
 * or a real one merged into a demo restaurant. Merges among demo restaurants are fine.
 */
export async function findCrossMerges(demoRestaurantIds: readonly string[]) {
  const ids = [...demoRestaurantIds];
  const rows = await db.restaurant.findMany({
    where: {
      OR: [
        { id: { in: ids }, mergedIntoId: { not: null, notIn: ids } },
        { id: { notIn: ids }, mergedIntoId: { in: ids } },
      ],
    },
    select: { name: true, mergedInto: { select: { name: true } } },
  });
  return rows.map((r) => ({ source: r.name, target: r.mergedInto?.name ?? "?" }));
}

/** Dishes an admin created from a demo user's dish proposal. */
export async function findDishesFromDemoProposals(demoUserIds: readonly string[]) {
  const items = await db.reviewItem.findMany({
    where: {
      createdByUserId: { in: [...demoUserIds] },
      type: "DISH_PROPOSAL",
      resolution: { startsWith: "created dish " },
      dishId: { not: null },
    },
    select: { dishId: true },
  });
  return [...new Set(items.map((i) => i.dishId!))];
}

/** What else the demo data touches: (city, dish) lists to re-rank, rows rated by demo users at other
 * restaurants, and other users who rated a demo restaurant's dishes. */
export async function findDemoFootprint(
  demoUserIds: readonly string[],
  restaurantIds: readonly string[],
) {
  const [groups, ratedElsewhere, otherRaters] = await Promise.all([
    db.restaurantDish.findMany({
      where: { restaurantId: { in: [...restaurantIds] } },
      distinct: ["cityId", "dishId"],
      select: { cityId: true, dishId: true },
    }),
    db.rating.findMany({
      where: {
        userId: { in: [...demoUserIds] },
        restaurantDish: { restaurantId: { notIn: [...restaurantIds] } },
      },
      distinct: ["restaurantDishId"],
      select: { restaurantDishId: true },
    }),
    db.rating.findMany({
      where: {
        userId: { notIn: [...demoUserIds] },
        restaurantDish: { restaurantId: { in: [...restaurantIds] } },
      },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);
  return {
    groups,
    rowsRatedElsewhere: ratedElsewhere.map((r) => r.restaurantDishId),
    otherRaterIds: otherRaters.map((r) => r.userId),
  };
}

/**
 * Deletes the demo data in one transaction: candidates go back to NEW, then review items, ratings
 * (history cascades), rows that would block the deletes, restaurants (dish rows and location
 * observations cascade), unused dishes from demo proposals, users (sessions cascade), their
 * rate-limit buckets and the job records.
 */
export async function deleteDemoData(
  input: {
    userIds: readonly string[];
    restaurantIds: readonly string[];
    proposalDishIds: readonly string[];
    jobName: string;
  },
  tx: Tx,
) {
  const userIds = [...input.userIds];
  const restaurantIds = [...input.restaurantIds];
  const onDemoRestaurant = { restaurantDish: { restaurantId: { in: restaurantIds } } };
  // Candidates of the demo restaurants go back to NEW; a demo candidate that a merge moved to a
  // real restaurant stays with it (only its reviewer, a demo user, goes: SET NULL).
  const candidates = await tx.overtureCandidate.updateMany({
    where: {
      OR: [
        { restaurantId: { in: restaurantIds } },
        { reviewedByUserId: { in: userIds }, restaurantId: null },
      ],
    },
    data: {
      status: "NEW",
      skipReason: null,
      restaurantId: null,
      reviewedByUserId: null,
      reviewedAt: null,
    },
  });
  const reviewItems = await tx.reviewItem.deleteMany({
    where: {
      OR: [{ createdByUserId: { in: userIds } }, { restaurantId: { in: restaurantIds } }],
    },
  });
  const ratings = await tx.rating.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, onDemoRestaurant] },
  });
  await tx.flag.deleteMany({ where: { OR: [{ userId: { in: userIds } }, onDemoRestaurant] } });
  await tx.ownerClaim.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { restaurantId: { in: restaurantIds } }] },
  });
  await tx.menuUpload.deleteMany({
    where: {
      OR: [{ uploadedByUserId: { in: userIds } }, { restaurantId: { in: restaurantIds } }],
    },
  });
  const restaurants = await tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } });

  // A dish an admin created from a demo proposal goes too, unless something real uses it now.
  const removedDishes: string[] = [];
  const keptDishes: string[] = [];
  for (const dishId of input.proposalDishIds) {
    const dish = await tx.dish.findUnique({
      where: { id: dishId },
      select: {
        slug: true,
        _count: { select: { restaurantDishes: true, dishStats: true, menuItems: true } },
      },
    });
    if (!dish) continue;
    const used = dish._count.restaurantDishes + dish._count.dishStats + dish._count.menuItems;
    if (used > 0) {
      keptDishes.push(dish.slug);
      continue;
    }
    await tx.dish.delete({ where: { id: dishId } });
    removedDishes.push(dish.slug);
  }

  const users = await tx.user.deleteMany({ where: { id: { in: userIds } } });
  const buckets =
    userIds.length === 0
      ? { count: 0 }
      : await tx.rateLimitBucket.deleteMany({
          where: { OR: userIds.map((id) => ({ key: { startsWith: `user:${id}:` } })) },
        });
  const jobRuns = await tx.jobRun.deleteMany({ where: { name: input.jobName } });
  return {
    candidatesReopened: candidates.count,
    reviewItems: reviewItems.count,
    ratings: ratings.count,
    restaurants: restaurants.count,
    users: users.count,
    rateLimitBuckets: buckets.count,
    jobRuns: jobRuns.count,
    removedDishes,
    keptDishes,
  };
}

/** Ratings and photo ratings counted again from the Rating table (after ratings were deleted). */
export async function recountRatingCounters(userIds: readonly string[]) {
  for (const id of userIds) {
    const [ratingsCount, photoRatings] = await Promise.all([
      db.rating.count({ where: { userId: id } }),
      db.rating.count({ where: { userId: id, photoPath: { not: null } } }),
    ]);
    await db.user.update({ where: { id }, data: { ratingsCount, photoRatings } });
  }
}
