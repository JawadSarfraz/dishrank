import { Prisma } from "@/generated/prisma/client";
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

export async function findDishById(id: string, client: Client = db) {
  return client.dish.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true, isLaunch: true },
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
    select: { id: true, slug: true, name: true, isLaunch: true },
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

export type DishSearchRow = {
  id: string;
  slug: string;
  name: string;
  isLaunch: boolean;
  category: string;
  eligibleCount: number;
};

/**
 * GET /api/v1/dishes (docs/05, docs/06). With `text` (already cleaned: lowercase ASCII words) a dish
 * matches when one of its spellings contains it or has trigram similarity ≥ 0.3; substring hits
 * first, then the best similarity with launch dishes boosted. Without text: every dish, launch
 * dishes first, then the most eligible rows. `eligibleCount` counts ranked rows (in the city).
 */
export async function searchDishes(input: {
  text?: string;
  cityId?: string;
  launchOnly: boolean;
  limit: number;
}) {
  const counts = Prisma.sql`
    SELECT "dishId", count(*)::int AS n FROM "RestaurantDish"
    WHERE "rankInCity" IS NOT NULL
      ${input.cityId ? Prisma.sql`AND "cityId" = ${input.cityId}` : Prisma.empty}
    GROUP BY "dishId"`;
  if (!input.text) {
    return db.$queryRaw<DishSearchRow[]>`
      SELECT d.id, d.slug, d.name, d."isLaunch", c.name AS category, coalesce(e.n, 0)::int AS "eligibleCount"
      FROM "Dish" d
      JOIN "DishCategory" c ON c.id = d."categoryId"
      LEFT JOIN (${counts}) e ON e."dishId" = d.id
      ${input.launchOnly ? Prisma.sql`WHERE d."isLaunch"` : Prisma.empty}
      ORDER BY d."isLaunch" DESC, "eligibleCount" DESC, d.name ASC
      LIMIT ${input.limit}`;
  }
  return db.$queryRaw<DishSearchRow[]>`
    SELECT d.id, d.slug, d.name, d."isLaunch", c.name AS category, coalesce(e.n, 0)::int AS "eligibleCount"
    FROM "Dish" d
    JOIN "DishCategory" c ON c.id = d."categoryId"
    LEFT JOIN (${counts}) e ON e."dishId" = d.id
    JOIN LATERAL (
      SELECT max(similarity(a.alias, ${input.text})) AS sim,
             bool_or(a.alias LIKE ${`%${input.text}%`}) AS hit
      FROM "DishAlias" a WHERE a."dishId" = d.id
    ) m ON true
    WHERE (m.hit OR m.sim >= 0.3)
      ${input.launchOnly ? Prisma.sql`AND d."isLaunch"` : Prisma.empty}
    ORDER BY m.hit DESC, (m.sim + CASE WHEN d."isLaunch" THEN 0.1 ELSE 0 END) DESC,
      "eligibleCount" DESC, d.name ASC
    LIMIT ${input.limit}`;
}

/** Aliases among `aliases` that already belong to a dish. */
export async function findTakenAliases(aliases: readonly string[], client: Client = db) {
  if (aliases.length === 0) return [];
  return client.dishAlias.findMany({
    where: { alias: { in: [...aliases] } },
    select: { alias: true, dish: { select: { slug: true } } },
  });
}

/** A new dish and its spellings (each stored normalised, docs/05), as a review decision makes it. */
export async function insertDishWithAliases(
  data: { slug: string; name: string; categoryId: string; aliases: readonly string[] },
  tx: Prisma.TransactionClient,
) {
  const dish = await tx.dish.create({
    data: { slug: data.slug, name: data.name, categoryId: data.categoryId, isLaunch: false },
    select: { id: true, slug: true, name: true },
  });
  await tx.dishAlias.createMany({
    data: data.aliases.map((alias) => ({ alias, dishId: dish.id })),
  });
  return dish;
}

export async function findDishCategory(id: string, client: Client = db) {
  return client.dishCategory.findUnique({ where: { id }, select: { id: true } });
}

export async function listDishCategories(client: Client = db) {
  return client.dishCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}
