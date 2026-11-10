// Reads for the public pages (ranking, restaurant, city and home pages, sitemap). They are cached by
// ISR and never depend on who is looking.
import type { Prisma, RestaurantDishStatus } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Client } from "./transaction";

/** A ranking page lists ranked rows and the candidates still collecting votes (not STALE/REMOVED). */
export const LISTED_STATUSES: RestaurantDishStatus[] = [
  "CANDIDATE",
  "USER_CONFIRMED",
  "MENU_VERIFIED",
  "OWNER_VERIFIED",
];

/**
 * docs/01 D2a (2026-11-11): a dish row is on the public lists (a "contender") only when it ranks,
 * has a counted rating, or its listing was checked by a person: created by hand, or an auto-listed
 * place an admin marked "Looks right" or edited. Auto-listed rows that only match by a word in the
 * place's name or category stay out; search and the rate flow still find the place.
 */
export const CONTENDER_FILTER = {
  OR: [
    { rankInCity: { not: null } },
    { distinctRaters: { gt: 0 } },
    { restaurant: { autoListedAt: null } },
    { restaurant: { checkedAt: { not: null } } },
  ],
} satisfies Prisma.RestaurantDishWhereInput;

export async function findCityBySlug(slug: string, client: Client = db) {
  return client.city.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, launchedAt: true },
  });
}

const rankingRowSelect = {
  id: true,
  status: true,
  score: true,
  rawMean: true,
  distinctRaters: true,
  ratingCount: true,
  weightSum: true,
  rankInCity: true,
  lastRatedAt: true,
  price: true,
  variantTags: true,
  restaurant: {
    select: {
      id: true,
      slug: true,
      name: true,
      source: true,
      priceBand: true,
      lat: true,
      lng: true,
      area: { select: { slug: true, name: true } },
    },
  },
} as const;

/**
 * docs/04 "Query for a ranking page": one (city, dish) list of ACTIVE restaurants. The ranked rows
 * come first, in rank order, then up to `take` rows without a rank by votes: two reads, so a
 * ranked row with a low score is never pushed out by rows still collecting votes (audit 2026-11,
 * B-12). Both use the (cityId, dishId, status, score) index.
 */
export async function listRankingRows(
  cityId: string,
  dishId: string,
  take: number,
  client: Client = db,
) {
  const where = {
    cityId,
    dishId,
    status: { in: LISTED_STATUSES },
    restaurant: { status: "ACTIVE" as const },
    ...CONTENDER_FILTER,
  };
  // One after another: a transaction client is one connection.
  const ranked = await client.restaurantDish.findMany({
    where: { ...where, rankInCity: { not: null } },
    orderBy: [{ rankInCity: "asc" }, { id: "asc" }],
    take,
    select: rankingRowSelect,
  });
  const waiting = await client.restaurantDish.findMany({
    where: { ...where, rankInCity: null },
    orderBy: [
      { distinctRaters: "desc" },
      { lastRatedAt: { sort: "desc", nulls: "last" } },
      { restaurant: { name: "asc" } },
      { id: "asc" },
    ],
    take,
    select: rankingRowSelect,
  });
  return [...ranked, ...waiting];
}

/** Per dish in a city: how many restaurants rank, the one ranked first, and the contenders. */
export async function listCityDishSummaries(cityId: string, client: Client = db) {
  const [counts, tops, contenders] = [
    await client.restaurantDish.groupBy({
      by: ["dishId"],
      where: { cityId, rankInCity: { not: null } },
      _count: { _all: true },
    }),
    await client.restaurantDish.findMany({
      where: { cityId, rankInCity: 1 },
      select: {
        dishId: true,
        score: true,
        distinctRaters: true,
        restaurant: { select: { slug: true, name: true } },
      },
    }),
    await client.restaurantDish.groupBy({
      by: ["dishId"],
      where: {
        cityId,
        status: { in: LISTED_STATUSES },
        restaurant: { status: "ACTIVE" },
        ...CONTENDER_FILTER,
      },
      _count: { _all: true },
    }),
  ];
  return { counts, tops, contenders };
}

/** Every dish row of one (city, dish), any status, with what /admin/contenders decides on. */
export async function listDishRowsForCuration(cityId: string, dishId: string, client: Client = db) {
  return client.restaurantDish.findMany({
    where: { cityId, dishId, restaurant: { status: { not: "DUPLICATE" } } },
    select: {
      id: true,
      status: true,
      score: true,
      distinctRaters: true,
      rankInCity: true,
      restaurant: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          autoListedAt: true,
          checkedAt: true,
          area: { select: { name: true } },
        },
      },
    },
  });
}

/** Dish rows linked per dish in every city, any listed status (the Auto-list's dry run), checked or not. */
export async function countListedRowsPerDish(client: Client = db) {
  const rows = await client.restaurantDish.groupBy({
    by: ["dishId"],
    where: { status: { in: LISTED_STATUSES }, restaurant: { status: "ACTIVE" } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.dishId, r._count._all]));
}

/**
 * For the sitemap: (city, dish) lists that rank at least one restaurant, and ACTIVE restaurants with
 * a counted rating on a listed dish (the pages that are not noindex), each with its latest rating.
 */
export async function listIndexablePages(client: Client = db) {
  const listGroups = await client.restaurantDish.groupBy({
    by: ["cityId", "dishId"],
    where: { rankInCity: { not: null } },
    _max: { lastRatedAt: true },
  });
  const restaurantGroups = await client.restaurantDish.groupBy({
    by: ["restaurantId"],
    where: { ratingCount: { gt: 0 }, status: { not: "REMOVED" }, restaurant: { status: "ACTIVE" } },
    _max: { lastRatedAt: true },
  });
  const cities = await client.city.findMany({ select: { id: true, slug: true } });
  const dishes = await client.dish.findMany({
    where: { id: { in: [...new Set(listGroups.map((g) => g.dishId))] } },
    select: { id: true, slug: true },
  });
  const restaurants = await client.restaurant.findMany({
    where: { id: { in: restaurantGroups.map((g) => g.restaurantId) } },
    select: { id: true, slug: true, city: { select: { slug: true } } },
  });
  const citySlug = new Map(cities.map((c) => [c.id, c.slug]));
  const dishSlug = new Map(dishes.map((d) => [d.id, d.slug]));
  const restaurant = new Map(restaurants.map((r) => [r.id, r]));
  return {
    cities: cities.map((c) => c.slug),
    lists: listGroups.flatMap((g) => {
      const city = citySlug.get(g.cityId);
      const dish = dishSlug.get(g.dishId);
      return city && dish
        ? [{ citySlug: city, dishSlug: dish, lastRatedAt: g._max.lastRatedAt }]
        : [];
    }),
    restaurants: restaurantGroups.flatMap((g) => {
      const r = restaurant.get(g.restaurantId);
      return r ? [{ citySlug: r.city.slug, slug: r.slug, lastRatedAt: g._max.lastRatedAt }] : [];
    }),
  };
}
