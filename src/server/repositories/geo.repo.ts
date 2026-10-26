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
    select: { id: true, cityId: true, lat: true, lng: true, city: { select: { slug: true } } },
  });
  return rows.map(({ city, ...area }) => ({ ...area, citySlug: city.slug }));
}

/** Cities with their launch dates (/admin/rankings, the nightly re-rank). */
export async function listCityLaunches(client: Client = db) {
  return client.city.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, launchedAt: true },
  });
}

/** Sets City.launchedAt once: false when the city was launched already. */
export async function setCityLaunchedAtOnce(id: string, launchedAt: Date, client: Client = db) {
  const { count } = await client.city.updateMany({
    where: { id, launchedAt: null },
    data: { launchedAt },
  });
  return count === 1;
}
