// Reads for the public pages (ranking, restaurant, city and home pages, sitemap). They are cached by
// ISR and never depend on who is looking.
import type { RestaurantDishStatus } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Client } from "./transaction";

/** A ranking page lists ranked rows and the candidates still collecting votes (not STALE/REMOVED). */
export const LISTED_STATUSES: RestaurantDishStatus[] = [
  "CANDIDATE",
  "USER_CONFIRMED",
  "MENU_VERIFIED",
  "OWNER_VERIFIED",
];

export async function findCityBySlug(slug: string, client: Client = db) {
  return client.city.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, launchedAt: true },
  });
}

/**
 * docs/04 "Query for a ranking page": one (city, dish) list of ACTIVE restaurants, best first. Uses
 * the (cityId, dishId, status, score) index.
 */
export async function listRankingRows(
  cityId: string,
  dishId: string,
  take: number,
  client: Client = db,
) {
  return client.restaurantDish.findMany({
    where: {
      cityId,
      dishId,
      status: { in: LISTED_STATUSES },
      restaurant: { status: "ACTIVE" },
    },
    orderBy: [
      { score: { sort: "desc", nulls: "last" } },
      { distinctRaters: "desc" },
      { lastRatedAt: { sort: "desc", nulls: "last" } },
      { restaurant: { name: "asc" } },
      { id: "asc" },
    ],
    take,
    select: {
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
          slug: true,
          name: true,
          priceBand: true,
          lat: true,
          lng: true,
          area: { select: { slug: true, name: true } },
        },
      },
    },
  });
}

/** Per dish in a city: how many restaurants rank, and the one ranked first. */
export async function listCityDishSummaries(cityId: string, client: Client = db) {
  const [counts, tops] = [
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
  ];
  return { counts, tops };
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
