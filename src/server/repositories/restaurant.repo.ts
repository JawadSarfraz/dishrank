import { Prisma, type RestaurantStatus } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Client, Tx } from "./transaction";

const place = {
  city: { select: { id: true, slug: true, name: true } },
  area: { select: { id: true, slug: true, name: true } },
} as const;

export async function findRestaurantById(id: string, client: Client = db) {
  return client.restaurant.findUnique({ where: { id }, include: place });
}

export async function findRestaurantBySlug(slug: string, client: Client = db) {
  return client.restaurant.findUnique({ where: { slug }, include: place });
}

export async function findRestaurantByGooglePlaceId(googlePlaceId: string, client: Client = db) {
  return client.restaurant.findUnique({
    where: { googlePlaceId },
    select: { id: true, slug: true, name: true },
  });
}

export async function findRestaurantsByGooglePlaceIds(ids: readonly string[], client: Client = db) {
  if (ids.length === 0) return [];
  return client.restaurant.findMany({
    where: { googlePlaceId: { in: [...ids] } },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      cityId: true,
      googlePlaceId: true,
      city: { select: { name: true } },
      area: { select: { name: true } },
    },
  });
}

/** Every restaurant of a city that can still be matched (not merged away), for import dedupe. */
/** Restaurants of these areas that can still be matched (not merged away), for import dedupe. */
export async function listRestaurantsInAreas(areaIds: readonly string[], client: Client = db) {
  if (areaIds.length === 0) return [];
  return client.restaurant.findMany({
    where: { areaId: { in: [...areaIds] }, status: { not: "DUPLICATE" } },
    select: {
      id: true,
      slug: true,
      name: true,
      aliases: true,
      areaId: true,
      status: true,
      googlePlaceId: true,
      area: { select: { name: true } },
      city: { select: { name: true } },
    },
  });
}

/** Slugs equal to `base` or starting with it, to pick a free `base-N`. */
export async function listSlugsStartingWith(base: string, client: Client = db) {
  const rows = await client.restaurant.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

export async function insertRestaurant(
  data: Prisma.RestaurantUncheckedCreateInput,
  client: Client = db,
) {
  return client.restaurant.create({
    data,
    select: { id: true, slug: true, name: true, cityId: true },
  });
}

export async function updateRestaurantById(
  id: string,
  data: Prisma.RestaurantUncheckedUpdateInput,
  client: Client = db,
) {
  return client.restaurant.update({
    where: { id },
    data,
    select: { id: true, slug: true, cityId: true, city: { select: { slug: true } } },
  });
}

/** Row locks for a merge, taken in id order so two merges cannot deadlock. */
export async function lockRestaurants(ids: readonly string[], tx: Tx) {
  return tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Restaurant" WHERE id IN (${Prisma.join([...ids])}) ORDER BY id FOR UPDATE`;
}

export type RestaurantSearchRow = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  status: RestaurantStatus;
  areaName: string | null;
  similarity: number;
};

/**
 * docs/05 restaurant search: `searchText` trigram similarity ≥ threshold (GIN index via `%`) or
 * ILIKE '%text%', best first. `text` must already be cleaned (lowercase a-z, 0-9, spaces), so it
 * carries no LIKE wildcards.
 */
export async function searchRestaurantsByText(input: {
  cityId: string;
  text: string;
  statuses: readonly RestaurantStatus[];
  threshold: number;
  limit: number;
  excludeId?: string;
}) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(input.threshold)}, true)`;
    return tx.$queryRaw<RestaurantSearchRow[]>`
      SELECT r.id, r.slug, r.name, r.address, r.status, a.name AS "areaName",
             similarity(r."searchText", ${input.text})::float8 AS "similarity"
      FROM "Restaurant" r
      LEFT JOIN "Area" a ON a.id = r."areaId"
      WHERE r."cityId" = ${input.cityId}
        AND r.status::text IN (${Prisma.join([...input.statuses])})
        AND (r."searchText" % ${input.text} OR r."searchText" ILIKE ${`%${input.text}%`})
        ${input.excludeId ? Prisma.sql`AND r.id <> ${input.excludeId}` : Prisma.empty}
      ORDER BY "similarity" DESC, r.name ASC
      LIMIT ${input.limit}`;
  });
}

/** One page of the admin list. `text` (cleaned) matches the search text or the slug. */
export async function listRestaurantsPage(input: {
  cityId?: string;
  status?: RestaurantStatus;
  text?: string;
  skip: number;
  take: number;
}) {
  const where: Prisma.RestaurantWhereInput = {
    ...(input.cityId ? { cityId: input.cityId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.text
      ? {
          OR: [
            { searchText: { contains: input.text } },
            { slug: { contains: input.text.replace(/ /g, "-") } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.restaurant.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: input.skip,
      take: input.take,
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        googlePlaceId: true,
        googleSyncedAt: true,
        lat: true,
        city: { select: { slug: true, name: true } },
        area: { select: { name: true } },
        _count: { select: { dishes: true } },
      },
    }),
    db.restaurant.count({ where }),
  ]);
  return { items, total };
}

/** Serialises slug picking for one base inside a transaction (released at commit or rollback). */
export async function lockSlugBase(base: string, tx: Tx) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${base}))`;
}

const refreshSelect = {
  id: true,
  googlePlaceId: true,
  googleSyncedAt: true,
  lat: true,
  lng: true,
} as const;

/** Rows still holding coordinates from a Google call older than `cutoff` (refresh catch-up). */
export async function listGoogleCoordinatesSyncedBefore(cutoff: Date) {
  return db.restaurant.findMany({
    where: {
      googleSyncedAt: { lt: cutoff },
      OR: [{ lat: { not: null } }, { lng: { not: null } }],
    },
    select: refreshSelect,
  });
}

/** Rows with a googlePlaceId whose googleSyncedAt is NULL or older than `cutoff`, oldest first. */
export async function listRestaurantsDueForRefresh(cutoff: Date) {
  return db.restaurant.findMany({
    where: {
      googlePlaceId: { not: null },
      OR: [{ googleSyncedAt: null }, { googleSyncedAt: { lt: cutoff } }],
    },
    orderBy: [{ googleSyncedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    select: refreshSelect,
  });
}
