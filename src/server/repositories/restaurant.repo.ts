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

export async function findRestaurantByOvertureId(overtureId: string, client: Client = db) {
  return client.restaurant.findUnique({
    where: { overtureId },
    select: { id: true, slug: true, name: true },
  });
}

/** Restaurants of a city that can still be matched (not merged away), for duplicate hints. */
export async function listRestaurantsForDedupe(cityId: string, client: Client = db) {
  const rows = await client.restaurant.findMany({
    where: { cityId, status: { not: "DUPLICATE" } },
    select: {
      id: true,
      slug: true,
      name: true,
      aliases: true,
      lat: true,
      lng: true,
      areaId: true,
      status: true,
      area: { select: { name: true } },
    },
  });
  return rows.map(({ area, ...r }) => ({ ...r, areaName: area?.name ?? null }));
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
        source: true,
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
