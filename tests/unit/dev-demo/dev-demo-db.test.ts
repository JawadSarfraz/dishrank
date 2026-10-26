import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { assertLocalDatabase } from "@/server/services/dev-demo-guard";
import { DEMO, createDemo, undoDemo } from "@/server/services/dev-demo.service";
import { createOrReplace } from "@/server/services/rating.service";
import { mergeRestaurants } from "@/server/services/restaurant.service";
import { resolveReviewItem } from "@/server/services/review.service";
import { resetAppData } from "../../setup/db-reset";
import {
  actorOf,
  daysAgo,
  dishId,
  makeDish,
  makeRestaurant,
  makeUser,
  place,
  uid,
} from "../restaurants/fixtures";

const LOCAL = "postgresql://dev@localhost:5433/dishrank";

describe("pnpm dev:demo guard", () => {
  it("accepts a database on this machine and names it without credentials", () => {
    expect(
      assertLocalDatabase({ DATABASE_URL: "postgresql://dev:secret@localhost:5433/dishrank" }),
    ).toEqual({ host: "localhost:5433", database: "dishrank" });
    expect(assertLocalDatabase({ DATABASE_URL: "postgres://127.0.0.1/dishrank" }).host).toBe(
      "127.0.0.1:5432",
    );
    expect(assertLocalDatabase({ DATABASE_URL: "postgresql://[::1]:5433/x" }).host).toBe(
      "[::1]:5433",
    );
    expect(
      assertLocalDatabase({ DATABASE_URL: "postgresql:///dishrank?host=/var/run/postgresql" }),
    ).toEqual({ host: "/var/run/postgresql:5432", database: "dishrank" });
    expect(assertLocalDatabase({ DATABASE_URL: LOCAL, DIRECT_URL: LOCAL }).database).toBe(
      "dishrank",
    );
    // node-postgres uses the last host= parameter: every one must be local, the last is shown.
    expect(
      assertLocalDatabase({ DATABASE_URL: "postgresql://u@localhost/x?host=/tmp&host=localhost" })
        .host,
    ).toBe("localhost:5432");
  });

  it.each([
    [{ DATABASE_URL: LOCAL, NODE_ENV: "production" }, /NODE_ENV is production/],
    [{ DATABASE_URL: LOCAL, VERCEL: "1" }, /Vercel/],
    [{ DATABASE_URL: LOCAL, VERCEL_ENV: "preview" }, /Vercel/],
    [{}, /DATABASE_URL is not set/],
    [{ DATABASE_URL: "postgresql://u:p@db.abcd.supabase.co:5432/postgres" }, /db\.abcd\.supabase/],
    [
      { DATABASE_URL: LOCAL, DIRECT_URL: "postgresql://u:p@aws-0.pooler.supabase.com/postgres" },
      /DIRECT_URL points at aws-0/,
    ],
    [{ DATABASE_URL: "postgresql://localhost/x?host=db.example.com" }, /db\.example\.com/],
    [
      { DATABASE_URL: "postgresql://u@localhost:5433/x?host=/tmp&host=db.example.com" },
      /db\.example\.com/,
    ],
    [{ DATABASE_URL: "mysql://localhost/x" }, /not a PostgreSQL URL/],
    [{ DATABASE_URL: "not a url" }, /not a URL/],
  ])("refuses %j", (env, message) => {
    expect(() => assertLocalDatabase(env)).toThrow(message);
  });

  it("never repeats the password", () => {
    expect(() =>
      assertLocalDatabase({ DATABASE_URL: "postgresql://u:hunter2@remote.example.com/x" }),
    ).toThrow(/^(?!.*hunter2).*remote\.example\.com/);
  });
});

describe("pnpm dev:demo create and undo (test DB)", () => {
  beforeEach(resetAppData);
  afterAll(resetAppData);

  /** A staged Overture place in one area, as `pnpm overture:sync` writes it. */
  async function stage(name: string, areaSlug: string, category: string, confidence: number) {
    const { city, area } = await place("islamabad", areaSlug);
    return db.overtureCandidate.create({
      data: {
        overtureId: `08f-${uid()}`,
        release: "2026-10-21.0",
        lastSeenRelease: "2026-10-21.0",
        cityId: city.id,
        suggestedAreaId: area.id,
        name,
        category,
        confidence,
        lat: area.lat + confidence / 1000,
        lng: area.lng,
        sources: ["meta"],
      },
    });
  }

  it("creates marked restaurants, users, ratings and review items, and --undo removes all of it", async () => {
    await stage("Pizza Uno", "f-7", "pizza_restaurant", 0.99);
    await stage("Quiet Bookshop", "f-7", "book_store", 0.98);
    await stage("Karachi Biryani House", "f-7", "pakistani_restaurant", 0.95);
    await stage("Pizza Due", "f-6", "pizza_restaurant", 0.97);
    await stage("Chai Dhaba", "f-6", "tea_room", 0.8);
    await stage("Pizza Tre", "blue-area", "pizza_restaurant", 0.96);
    await stage("Pizza Quattro", "g-9", "pizza_restaurant", 0.94);
    await stage("G9 Burger Lab", "g-9", "burger_restaurant", 0.7);
    // A real restaurant already in the pizza list: ranked last while the demo is there.
    const real = await makeRestaurant("Real Pizza");
    const realRow = await makeDish(real, "pizza", {
      status: "USER_CONFIRMED",
      ratingCount: 9,
      distinctRaters: 9,
      weightSum: 6,
      weightedScoreSum: 27,
      rawMean: 3,
      score: 3,
    });

    const summary = await createDemo({ restaurants: 7 });
    expect(summary.restaurants).toHaveLength(7);
    expect(summary.restaurants.every((r) => r.name.endsWith(" (demo)"))).toBe(true);
    expect(summary.ratings).toMatchObject({ held: 6, skipped: 0 });
    expect(summary.ratings.saved).toBe(await db.rating.count());
    expect(summary.rankedRows).toBeGreaterThanOrEqual(3);
    const pizza = summary.lists.find((l) => l.dish === "Pizza");
    expect(pizza?.rows[0]).toMatchObject({ rank: 1 });

    const users = await db.user.findMany({
      where: { email: { endsWith: `@${DEMO.emailDomain}` } },
    });
    expect(users).toHaveLength(13);
    expect(users.filter((u) => u.isPanel)).toMatchObject([{ trustScore: 1.3 }]);
    const demoAdmin = users.find((u) => u.role === "ADMIN")!;
    expect(
      await db.overtureCandidate.count({
        where: { status: "CREATED", reviewedByUserId: demoAdmin.id },
      }),
    ).toBe(7);
    expect(
      await db.overtureCandidate.findFirstOrThrow({ where: { name: "Quiet Bookshop" } }),
    ).toMatchObject({ status: "NEW" });
    // Chicken Karahi rated at the Pakistani place: the rating added the row (docs/05).
    expect(
      await db.restaurantDish.findFirst({
        where: {
          dish: { slug: "chicken-karahi" },
          restaurant: { name: { startsWith: "Karachi" } },
        },
      }),
    ).toMatchObject({ source: "USER" });
    // Six held ratings: five from the burst, one for the phone number in its comment.
    expect(await db.rating.count({ where: { status: "HELD" } })).toBe(6);
    const items = await db.reviewItem.findMany({ where: { status: "OPEN" } });
    expect(items.map((i) => i.type).sort()).toEqual([
      "DISH_PROPOSAL",
      "LOCATION_SUGGESTION",
      "RESTAURANT_PROPOSAL",
      "SUSPICIOUS_RATINGS",
      "SUSPICIOUS_RATINGS",
    ]);
    expect(
      items
        .filter((i) => i.type === "SUSPICIOUS_RATINGS")
        .map((i) => (i.payload as { reason: string }).reason)
        .sort(),
    ).toEqual(["BURST", "COMMENT"]);
    expect(await db.ratingHistory.count()).toBeGreaterThanOrEqual(1);
    await expect(createDemo({ restaurants: 7 })).rejects.toMatchObject({ code: "DEMO_EXISTS" });

    // What someone trying the demo might do: rate a demo dish, accept the suggestions.
    const diner = await makeUser("Real Diner", { createdAt: daysAgo(30) });
    const demoPizza = summary.restaurants[0];
    await createOrReplace(actorOf(diner), {
      restaurantId: demoPizza.id,
      dishId: await dishId("pizza"),
      score: 7,
    });
    const admin = actorOf(await makeUser("Real Admin", { role: "ADMIN" }));
    const { area } = await place("islamabad", "g-9");
    await resolveReviewItem(admin, items.find((i) => i.type === "RESTAURANT_PROPOSAL")!.id, {
      action: "create_restaurant",
      payload: { restaurant: { name: "Tikka Corner (demo)", areaId: area.id, address: "G-9" } },
    });
    const category = await db.dishCategory.findFirstOrThrow();
    await resolveReviewItem(admin, items.find((i) => i.type === "DISH_PROPOSAL")!.id, {
      action: "create_dish",
      payload: {
        dish: {
          slug: "fixture-kunna-gosht",
          name: "Kunna Gosht",
          categoryId: category.id,
          aliases: [],
        },
      },
    });
    expect(await db.restaurant.count()).toBe(9);

    const undone = await undoDemo();
    expect(undone).toMatchObject({
      restaurants: 8,
      users: 13,
      candidatesReopened: 7,
      removedDishes: ["fixture-kunna-gosht"],
      otherRaters: 1,
    });
    expect(await db.restaurant.findMany({ select: { id: true } })).toEqual([{ id: real.id }]);
    expect(await db.user.count({ where: { email: { endsWith: `@${DEMO.emailDomain}` } } })).toBe(0);
    expect(await db.overtureCandidate.count({ where: { status: { not: "NEW" } } })).toBe(0);
    expect(await db.rating.count()).toBe(0);
    expect(await db.reviewItem.count()).toBe(0);
    expect(await db.jobRun.count({ where: { name: DEMO.job } })).toBe(0);
    const buckets = await db.rateLimitBucket.findMany({ select: { key: true } });
    expect(buckets.filter((b) => users.some((u) => b.key.includes(u.id)))).toEqual([]);
    expect(buckets.some((b) => b.key.includes(diner.id))).toBe(true); // a real user's stay
    expect(await db.dish.findUnique({ where: { slug: "fixture-kunna-gosht" } })).toBeNull();
    // The real row is alone in its list again, and the real diner's counters match what is left.
    expect(await db.restaurantDish.findUniqueOrThrow({ where: { id: realRow.id } })).toMatchObject({
      rankInCity: 1,
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: diner.id } })).toMatchObject({
      ratingsCount: 0,
    });
    // Nothing left to remove: a second undo is harmless.
    expect(await undoDemo()).toMatchObject({ restaurants: 0, users: 0, ratings: 0 });
  }, 120_000);

  it("undo removes demo restaurants merged into each other", async () => {
    await stage("Pizza Uno", "f-7", "pizza_restaurant", 0.99);
    await stage("Pizza Due", "f-6", "pizza_restaurant", 0.97);
    await stage("Pizza Tre", "blue-area", "pizza_restaurant", 0.96);
    const { restaurants } = await createDemo({ restaurants: 3 });
    const admin = actorOf(await makeUser("Real Admin", { role: "ADMIN" }));
    await mergeRestaurants(admin, restaurants[1].id, restaurants[0].id);
    expect(await undoDemo()).toMatchObject({ restaurants: 3, users: 13 });
    expect(await db.restaurant.count()).toBe(0);
    expect(await db.overtureCandidate.count({ where: { status: { not: "NEW" } } })).toBe(0);
  }, 120_000);

  it("undo refuses, and removes nothing, when a demo restaurant was merged with a real one", async () => {
    await stage("Pizza Uno", "f-7", "pizza_restaurant", 0.99);
    await stage("Pizza Due", "f-6", "pizza_restaurant", 0.97);
    await stage("Pizza Tre", "blue-area", "pizza_restaurant", 0.96);
    const { restaurants } = await createDemo({ restaurants: 3 });
    const admin = actorOf(await makeUser("Real Admin", { role: "ADMIN" }));
    const real = await makeRestaurant("Real Pizza House");
    await mergeRestaurants(admin, restaurants[2].id, real.id);
    await expect(undoDemo()).rejects.toMatchObject({ code: "DEMO_MERGED" });
    expect(await db.user.count({ where: { email: { endsWith: `@${DEMO.emailDomain}` } } })).toBe(
      13,
    );
    expect(await db.restaurant.count()).toBe(4);
  }, 120_000);
});
