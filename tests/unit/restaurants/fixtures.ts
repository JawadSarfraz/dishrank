// Test-database fixtures (tests/setup: dishrank_test only). Rows are written with Prisma directly so
// tests can set up states (claims, statuses, ratings) that the app creates in later phases.
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/roles";
import { buildSearchText } from "@/server/services/restaurant.service";

export const ADMIN: SessionUser = {
  id: "test-admin",
  email: "admin@test.local",
  name: "Admin",
  role: "ADMIN",
};
export const USER: SessionUser = { ...ADMIN, id: "test-user", role: "USER" };

export const uid = () => randomUUID().replace(/-/g, "").slice(0, 12);

export async function place(citySlug = "islamabad", areaSlug = "f-7") {
  const city = await db.city.findUniqueOrThrow({ where: { slug: citySlug } });
  const area = await db.area.findUniqueOrThrow({
    where: { cityId_slug: { cityId: city.id, slug: areaSlug } },
  });
  return { city, area };
}

export async function dishId(slug: string) {
  return (await db.dish.findUniqueOrThrow({ where: { slug } })).id;
}

export async function makeUser(
  name = "Rater",
  over: Partial<Prisma.UserUncheckedCreateInput> = {},
) {
  return db.user.create({ data: { email: `${uid()}@test.local`, name, ...over } });
}

/** The service-layer view of a user row (role from the row, never from the client). */
export const actorOf = (user: { id: string; email: string; name: string; role: string }) =>
  ({ id: user.id, email: user.email, name: user.name, role: user.role }) as SessionUser;

export async function makeRestaurant(
  name: string,
  over: Partial<Prisma.RestaurantUncheckedCreateInput> & {
    citySlug?: string;
    areaSlug?: string;
  } = {},
) {
  const { citySlug, areaSlug, ...data } = over;
  const { city, area } = await place(citySlug, areaSlug);
  return db.restaurant.create({
    data: {
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${uid()}`,
      name,
      cityId: city.id,
      areaId: area.id,
      address: `${area.name}, ${city.name}`,
      source: "MANUAL",
      searchText: buildSearchText(name, (data.aliases as string[] | undefined) ?? []),
      ...data,
    },
  });
}

export async function makeDish(
  restaurant: { id: string; cityId: string },
  dishSlug: string,
  over: Partial<Prisma.RestaurantDishUncheckedCreateInput> = {},
) {
  return db.restaurantDish.create({
    data: {
      restaurantId: restaurant.id,
      dishId: await dishId(dishSlug),
      cityId: restaurant.cityId,
      source: "USER",
      ...over,
    },
  });
}

/** A rating whose updatedAt (the decay clock) is set explicitly, as Prisma's @updatedAt would override it. */
export async function makeRating(
  restaurantDishId: string,
  userId: string,
  score: number,
  updatedAt: Date,
  over: Partial<Prisma.RatingUncheckedCreateInput> = {},
) {
  const rating = await db.rating.create({
    data: { restaurantDishId, userId, score, createdAt: updatedAt, ...over },
  });
  await db.$executeRaw`UPDATE "Rating" SET "updatedAt" = ${updatedAt} WHERE id = ${rating.id}`;
  return { ...rating, updatedAt };
}

export const daysAgo = (days: number, now = new Date()) =>
  new Date(now.getTime() - days * 86_400_000);
