import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

/** The default client or a transaction client, so seeding can run in one transaction. */
type Client = typeof db | Prisma.TransactionClient;

export async function upsertCity(
  c: { slug: string; name: string; lat: number; lng: number },
  client: Client = db,
) {
  // launchedAt is never set or reset here: an admin sets it on launch day (docs/04).
  return client.city.upsert({
    where: { slug: c.slug },
    create: c,
    update: { name: c.name, lat: c.lat, lng: c.lng },
    select: { id: true },
  });
}

export async function upsertArea(
  a: { cityId: string; slug: string; name: string; lat: number; lng: number },
  client: Client = db,
) {
  return client.area.upsert({
    where: { cityId_slug: { cityId: a.cityId, slug: a.slug } },
    create: a,
    update: { name: a.name, lat: a.lat, lng: a.lng },
    select: { id: true },
  });
}

export async function upsertCategory(
  c: { slug: string; name: string; sortOrder: number },
  client: Client = db,
) {
  return client.dishCategory.upsert({
    where: { slug: c.slug },
    create: c,
    update: { name: c.name, sortOrder: c.sortOrder },
    select: { id: true },
  });
}

export async function upsertDish(
  d: { slug: string; name: string; categoryId: string; isLaunch: boolean },
  client: Client = db,
) {
  return client.dish.upsert({
    where: { slug: d.slug },
    create: d,
    update: { name: d.name, categoryId: d.categoryId, isLaunch: d.isLaunch },
    select: { id: true },
  });
}

export async function upsertDishAlias(a: { alias: string; dishId: string }, client: Client = db) {
  return client.dishAlias.upsert({
    where: { alias: a.alias },
    create: a,
    update: { dishId: a.dishId },
    select: { id: true },
  });
}

export async function countTaxonomy(client: Client = db) {
  const [cities, areas, categories, dishes, aliases] = await Promise.all([
    client.city.count(),
    client.area.count(),
    client.dishCategory.count(),
    client.dish.count(),
    client.dishAlias.count(),
  ]);
  return { cities, areas, categories, dishes, aliases };
}

/** Every alias with its dish, for the matcher's alias index (docs/05 step 2). */
export async function listDishAliases(client: Client = db) {
  return client.dishAlias.findMany({
    select: { alias: true, dish: { select: { id: true, slug: true, name: true } } },
  });
}

/**
 * docs/05 step 4: best similarity per dish, one alias at a time. SET LOCAL (set_config(..., true))
 * makes the `%` operator use the GIN index with the same threshold the caller asks for.
 */
export async function findTrigramMatches(text: string, threshold: number, limit: number) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(threshold)}, true)`;
    return tx.$queryRaw<{ dishId: string; dishSlug: string; similarity: number }[]>`
      SELECT d.id AS "dishId", d.slug AS "dishSlug", max(similarity(a.alias, ${text}))::float8 AS "similarity"
      FROM "DishAlias" a
      JOIN "Dish" d ON d.id = a."dishId"
      WHERE a.alias % ${text}
      GROUP BY d.id, d.slug
      ORDER BY "similarity" DESC, d.slug ASC
      LIMIT ${limit}`;
  });
}

export async function findDishBySlug(slug: string, client: Client = db) {
  return client.dish.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, category: { select: { slug: true } } },
  });
}

export async function findDishesBySlugs(slugs: readonly string[], client: Client = db) {
  return client.dish.findMany({
    where: { slug: { in: [...slugs] } },
    select: { id: true, slug: true, name: true },
  });
}

/** Every dish for pickers: launch dishes first, then by name. */
export async function listDishesForPicker(client: Client = db) {
  return client.dish.findMany({
    orderBy: [{ isLaunch: "desc" }, { name: "asc" }],
    select: { slug: true, name: true, isLaunch: true },
  });
}

/** Launch dishes for the admin tick boxes, by category order then name. */
export async function listLaunchDishes(client: Client = db) {
  return client.dish.findMany({
    where: { isLaunch: true },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    select: { id: true, slug: true, name: true },
  });
}

/** Every alias of the launch dishes, for the import's dish hints. */
export async function listLaunchDishAliases(client: Client = db) {
  const rows = await client.dishAlias.findMany({
    where: { dish: { isLaunch: true } },
    select: { alias: true, dish: { select: { slug: true } } },
  });
  return rows.map((r) => ({ alias: r.alias, dishSlug: r.dish.slug }));
}
