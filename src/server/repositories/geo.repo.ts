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
