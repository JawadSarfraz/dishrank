import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

type Client = typeof db | Prisma.TransactionClient;

const areaSelect = { id: true, slug: true, name: true, lat: true, lng: true } as const;

export async function findCityWithAreasBySlug(slug: string, client: Client = db) {
  return client.city.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      areas: { select: areaSelect, orderBy: { name: "asc" } },
    },
  });
}

export async function findCityWithAreasById(id: string, client: Client = db) {
  return client.city.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      areas: { select: areaSelect, orderBy: { name: "asc" } },
    },
  });
}

export async function listCitiesWithAreas(client: Client = db) {
  return client.city.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      areas: { select: areaSelect, orderBy: { name: "asc" } },
    },
  });
}

export async function findAreaById(id: string, client: Client = db) {
  return client.area.findUnique({ where: { id }, select: { ...areaSelect, cityId: true } });
}

export async function findAreaWithCityById(id: string, client: Client = db) {
  return client.area.findUnique({
    where: { id },
    select: { ...areaSelect, city: { select: { id: true, slug: true, name: true } } },
  });
}

/** Every seed area with its city slug, for placing Overture candidates. */
export async function listAreasWithCity(client: Client = db) {
  const rows = await client.area.findMany({
    orderBy: [{ cityId: "asc" }, { slug: "asc" }],
    select: {
      id: true,
      cityId: true,
      lat: true,
      lng: true,
      radiusKm: true,
      city: { select: { slug: true } },
    },
  });
  return rows.map(({ city, ...area }) => ({ ...area, citySlug: city.slug }));
}

const featuredSelect = {
  position: true,
  dish: { select: { id: true, slug: true, name: true } },
} as const;

/** Cities with their launch dates and featured round (/admin/rankings, the nightly re-rank). */
export async function listCityLaunches(client: Client = db) {
  return client.city.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      launchedAt: true,
      featuredClosesAt: true,
      featuredRound: true,
      featured: { orderBy: { position: "asc" }, select: featuredSelect },
    },
  });
}

/** The dishes a city's home page leads with, in position order (docs/01 Home). */
export async function listFeaturedDishes(cityId: string, client: Client = db) {
  return client.featuredDish.findMany({
    where: { cityId },
    orderBy: { position: "asc" },
    select: featuredSelect,
  });
}

/** Whether a dish is featured in a city, with the round's closing date and name. */
export async function findFeaturedDish(cityId: string, dishId: string, client: Client = db) {
  return client.featuredDish.findUnique({
    where: { cityId_dishId: { cityId, dishId } },
    select: { position: true, city: { select: { featuredClosesAt: true, featuredRound: true } } },
  });
}

/** Replaces a city's featured dishes (position order) and sets the round's date and name. */
export async function replaceFeaturedDishes(
  cityId: string,
  dishIds: readonly string[],
  round: { featuredClosesAt: Date | null; featuredRound: string | null },
  client: Client = db,
) {
  await client.featuredDish.deleteMany({ where: { cityId } });
  if (dishIds.length > 0) {
    await client.featuredDish.createMany({
      data: dishIds.map((dishId, i) => ({ cityId, dishId, position: i + 1 })),
    });
  }
  await client.city.update({ where: { id: cityId }, data: round, select: { id: true } });
}

/** The seed's first round, only for a city with no featured dishes, date or name yet. */
export async function seedFeaturedDishesIfEmpty(
  cityId: string,
  dishIds: readonly string[],
  round: { featuredClosesAt: Date | null; featuredRound: string | null },
  client: Client = db,
) {
  const city = await client.city.findUniqueOrThrow({
    where: { id: cityId },
    select: { featuredClosesAt: true, featuredRound: true, _count: { select: { featured: true } } },
  });
  if (city._count.featured > 0 || city.featuredClosesAt || city.featuredRound) return false;
  await replaceFeaturedDishes(cityId, dishIds, round, client);
  return true;
}

/** Per city: the dish rows ranked now, and how many of them meet these thresholds as well. */
export async function countRankedRowsByCity(
  min: { minRaters: number; minWeight: number },
  client: Client = db,
) {
  return client.$queryRaw<{ cityId: string; ranked: number; kept: number }[]>`
    SELECT "cityId", count(*)::int AS ranked,
      (count(*) FILTER (
        WHERE "distinctRaters" >= ${min.minRaters} AND "eligibilityWeight" >= ${min.minWeight}
      ))::int AS kept
    FROM "RestaurantDish"
    WHERE "rankInCity" IS NOT NULL
    GROUP BY "cityId"`;
}

/** Sets City.launchedAt once: false when the city was launched already. */
export async function setCityLaunchedAtOnce(id: string, launchedAt: Date, client: Client = db) {
  const { count } = await client.city.updateMany({
    where: { id, launchedAt: null },
    data: { launchedAt },
  });
  return count === 1;
}
