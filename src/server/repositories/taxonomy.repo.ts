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
