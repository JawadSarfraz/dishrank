import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createOrReplace } from "@/server/services/rating.service";
import { getReviewQueue, resolveReviewItem } from "@/server/services/review.service";
import { propose } from "@/server/services/proposal.service";
import { recordLocationObservation } from "@/server/services/location.service";
import type { SessionUser } from "@/server/roles";
import { resetAppData } from "../../setup/db-reset";
import {
  USER,
  actorOf,
  daysAgo,
  dishId,
  makeRestaurant,
  makeUser,
  place,
} from "../restaurants/fixtures";

const NOW = new Date();
let admin: SessionUser;

const oldUser = (name = "Diner", over = {}) =>
  makeUser(name, { createdAt: daysAgo(30, NOW), ...over });
const rate = async (
  user: Parameters<typeof actorOf>[0],
  restaurantId: string,
  dishSlug: string,
  over: Record<string, unknown> = {},
) =>
  createOrReplace(
    actorOf(user),
    { restaurantId, dishId: await dishId(dishSlug), score: 8, ...over },
    { now: NOW },
  );
const openItem = (type: string) =>
  db.reviewItem.findFirstOrThrow({
    where: { type: type as never, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });

describe("/admin/review decisions (docs/07 §6, test DB)", () => {
  beforeEach(async () => {
    await resetAppData();
    admin = actorOf(await makeUser("Admin", { role: "ADMIN" }));
  });
  afterAll(() => db.$disconnect());

  it("is for admins; lists open items with their ratings and counts", async () => {
    const r = await makeRestaurant("Fixture Queue");
    await rate(await oldUser(), r.id, "chai", { comment: "Call 0300 1234567" });
    await expect(getReviewQueue(USER, { status: "OPEN", limit: 50 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const queue = await getReviewQueue(admin, { status: "OPEN", limit: 50 }, NOW);
    expect(queue.counts).toEqual({ SUSPICIOUS_RATINGS: 1 });
    expect(queue.items[0]).toMatchObject({
      type: "SUSPICIOUS_RATINGS",
      restaurant: { name: "Fixture Queue" },
    });
    expect(queue.items[0].ratings).toMatchObject([
      { score: 8, comment: "Call 0300 1234567", accountDays: 30 },
    ]);
  });

  it("approve releases a held rating without moving its decay clock; a decided item stays decided", async () => {
    const r = await makeRestaurant("Fixture Release");
    const held = await rate(await oldUser(), r.id, "chai", { comment: "www.chai.pk" });
    const before = await db.rating.findUniqueOrThrow({ where: { id: held.ratingId } });
    const item = await openItem("SUSPICIOUS_RATINGS");
    const result = await resolveReviewItem(admin, item.id, { action: "release" }, NOW);
    expect(result).toMatchObject({ status: "RESOLVED", resolution: "released 1" });
    const after = await db.rating.findUniqueOrThrow({ where: { id: held.ratingId } });
    expect(after.status).toBe("ACTIVE");
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    expect(
      (await db.restaurantDish.findUniqueOrThrow({ where: { id: held.restaurantDishId } }))
        .ratingCount,
    ).toBe(1);
    expect(await db.reviewItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
      status: "RESOLVED",
      resolvedByUserId: admin.id,
    });
    await expect(resolveReviewItem(admin, item.id, { action: "hide" }, NOW)).rejects.toMatchObject({
      code: "ITEM_CLOSED",
      status: 409,
    });
    await expect(resolveReviewItem(admin, item.id, { action: "merge" }, NOW)).rejects.toMatchObject(
      {
        code: "ITEM_CLOSED",
      },
    );
  });

  it("reject hides held ratings; the second hidden rating drops the rater's trust to 0.3", async () => {
    const user = await oldUser("Spammer");
    const a = await makeRestaurant("Fixture Hide A");
    const b = await makeRestaurant("Fixture Hide B");
    await rate(user, a.id, "chai", { comment: "wa.me/923001234567" });
    await resolveReviewItem(
      admin,
      (await openItem("SUSPICIOUS_RATINGS")).id,
      { action: "hide" },
      NOW,
    );
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).trustScore).toBe(0.6);
    await rate(user, b.id, "chai", { comment: "call 0333 7654321" });
    await resolveReviewItem(
      admin,
      (await openItem("SUSPICIOUS_RATINGS")).id,
      { action: "hide" },
      NOW,
    );
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).trustScore).toBe(0.3);
    expect(await db.rating.count({ where: { userId: user.id, status: "HIDDEN" } })).toBe(2);
  });

  it("released burst ratings are never held again; a rating also in a comment item waits for it", async () => {
    const r = await makeRestaurant("Fixture Burst Release");
    const young = (i: number) => makeUser(`Young ${i}`, { createdAt: daysAgo(1, NOW) });
    for (let i = 0; i < 5; i++) await rate(await young(i), r.id, "broast");
    const burst = await openItem("SUSPICIOUS_RATINGS");
    const out = await resolveReviewItem(admin, burst.id, { action: "release" }, NOW);
    expect(out.resolution).toBe("released 5");
    // A 6th young account: the released five do not count, so nothing is held.
    expect((await rate(await young(5), r.id, "broast")).held).toBe(false);
    expect(await db.rating.count({ where: { status: "HELD" } })).toBe(0);

    // A burst-held rating whose author then adds a phone number stays held after the burst release.
    const r2 = await makeRestaurant("Fixture Burst Comment");
    const users: Awaited<ReturnType<typeof young>>[] = [];
    for (let i = 0; i < 5; i++) {
      const u = await young(10 + i);
      users.push(u);
      await rate(u, r2.id, "pizza");
    }
    await rate(users[0], r2.id, "pizza", { comment: "call 0300 1234567" });
    const items = await db.reviewItem.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
    });
    expect(items.map((i) => (i.payload as { reason: string }).reason)).toEqual([
      "BURST",
      "COMMENT",
    ]);
    await resolveReviewItem(admin, items[0].id, { action: "release" }, NOW);
    const statuses = await db.rating.findMany({
      where: { restaurantDish: { restaurantId: r2.id } },
      select: { userId: true, status: true },
    });
    expect(statuses.find((s) => s.userId === users[0].id)?.status).toBe("HELD");
    expect(statuses.filter((s) => s.status === "ACTIVE")).toHaveLength(4);
  });

  it("marks the burst ratings that look genuine; releasing them leaves the rest held", async () => {
    const r = await makeRestaurant("Fixture Burst Genuine");
    const other = await makeRestaurant("Fixture Elsewhere");
    const young = (i: number) => makeUser(`Young ${i}`, { createdAt: daysAgo(1, NOW) });
    const real = [await young(0), await young(1)];
    for (const u of real) await rate(u, other.id, "chai", { score: 5 });
    const ring = [await young(2), await young(3), await young(4)];
    // The last one rated elsewhere too, but gives everything a 9.
    await rate(ring[2]!, other.id, "chai", { score: 9 });
    for (const u of [...real, ...ring]) await rate(u, r.id, "broast", { score: 9 });

    const queue = await getReviewQueue(
      admin,
      { type: "SUSPICIOUS_RATINGS", status: "OPEN", limit: 50 },
      NOW,
    );
    const marks = queue.items[0]!.ratings.map((x) => [x.userId, x.looksGenuine]);
    expect(Object.fromEntries(marks)).toEqual({
      [real[0]!.id]: true,
      [real[1]!.id]: true,
      [ring[0]!.id]: false,
      [ring[1]!.id]: false,
      [ring[2]!.id]: false,
    });

    const burst = await openItem("SUSPICIOUS_RATINGS");
    const out = await resolveReviewItem(admin, burst.id, { action: "release_genuine" }, NOW);
    expect(out.resolution).toBe("released 2, 3 still held");
    const statusOf = async (userId: string) =>
      (
        await db.rating.findFirstOrThrow({
          where: { userId, restaurantDish: { restaurantId: r.id } },
        })
      ).status;
    expect(await statusOf(real[0]!.id)).toBe("ACTIVE");
    expect(await statusOf(ring[0]!.id)).toBe("HELD");

    // The rest wait in an open item of their own, and the released two stay clear of the burst rule.
    const rest = await openItem("SUSPICIOUS_RATINGS");
    expect(rest.id).not.toBe(burst.id);
    expect((rest.payload as { ratingIds: string[] }).ratingIds).toHaveLength(3);
    await rate(await young(5), r.id, "broast", { score: 9 });
    expect(await statusOf(real[0]!.id)).toBe("ACTIVE");
    await resolveReviewItem(
      admin,
      (await openItem("SUSPICIOUS_RATINGS")).id,
      { action: "hide" },
      NOW,
    );
    expect(await statusOf(ring[0]!.id)).toBe("HIDDEN");

    // Nothing to mark: a burst of accounts that only rated here can only be decided as a whole.
    const r2 = await makeRestaurant("Fixture Burst None");
    for (let i = 10; i < 15; i++) await rate(await young(i), r2.id, "pizza", { score: 9 });
    await expect(
      resolveReviewItem(
        admin,
        (await openItem("SUSPICIOUS_RATINGS")).id,
        { action: "release_genuine" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "NOTHING_GENUINE" });
  });

  it("a held comment is not a burst: its item cannot be released by the genuine rule", async () => {
    const r = await makeRestaurant("Fixture Comment Only");
    await rate(await oldUser(), r.id, "chai", { comment: "Call 0300 1234567" });
    await expect(
      resolveReviewItem(
        admin,
        (await openItem("SUSPICIOUS_RATINGS")).id,
        { action: "release_genuine" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "ACTION_NOT_ALLOWED" });
  });

  it("dish suggestions: create the dish with its spellings, or map, or reject", async () => {
    const user = await oldUser();
    const r = await makeRestaurant("Fixture Dish Ideas");
    const category = await db.dishCategory.findFirstOrThrow();
    await propose(actorOf(user), { type: "DISH", name: "Fixture Lahori Fish", restaurantId: r.id });
    const item = await openItem("DISH_PROPOSAL");
    await expect(
      resolveReviewItem(admin, item.id, {
        action: "create_dish",
        payload: {
          dish: {
            slug: "fixture-lahori-fish",
            name: "Fixture Lahori Fish",
            categoryId: category.id,
            aliases: ["chicken karahi"],
          },
        },
      }),
    ).rejects.toMatchObject({ code: "ALIAS_TAKEN" });
    await expect(
      resolveReviewItem(admin, item.id, {
        action: "create_dish",
        payload: {
          dish: { slug: "pizza", name: "Pizza Two", categoryId: category.id, aliases: [] },
        },
      }),
    ).rejects.toMatchObject({ code: "DISH_EXISTS" });
    await resolveReviewItem(admin, item.id, {
      action: "create_dish",
      payload: {
        dish: {
          slug: "fixture-lahori-fish",
          name: "Fixture Lahori Fish",
          categoryId: category.id,
          aliases: ["Fixture Lahori Machli", "FIXTURE  lahori fish!"], // a copy of the name, normalised away
        },
      },
    });
    const dish = await db.dish.findUniqueOrThrow({
      where: { slug: "fixture-lahori-fish" },
      include: { aliases: true },
    });
    expect(dish.isLaunch).toBe(false);
    expect(dish.aliases.map((a) => a.alias).sort()).toEqual([
      "fixture lahori fish",
      "fixture lahori machli",
    ]);
    expect(await db.reviewItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
      status: "RESOLVED",
      dishId: dish.id,
    });

    await propose(actorOf(user), { type: "DISH", name: "Karhai Chicken Special" });
    const map = await openItem("DISH_PROPOSAL");
    await resolveReviewItem(admin, map.id, {
      action: "map_to_dish",
      payload: { dishId: await dishId("chicken-karahi") },
    });
    await propose(actorOf(user), { type: "DISH", name: "Not A Dish Really" });
    const rej = await openItem("DISH_PROPOSAL");
    expect(
      await resolveReviewItem(admin, rej.id, { action: "reject", payload: { reason: "Not food" } }),
    ).toMatchObject({
      status: "REJECTED",
      resolution: "rejected: Not food",
    });
  });

  it("restaurant suggestions: create by hand (MANUAL) or link; nothing exists before approval", async () => {
    const user = await oldUser();
    const { city, area } = await place("islamabad", "g-9");
    await propose(actorOf(user), {
      type: "RESTAURANT",
      name: "Fixture Dhaba",
      cityId: city.id,
      areaId: area.id,
    });
    expect(await db.restaurant.count()).toBe(0);
    const item = await openItem("RESTAURANT_PROPOSAL");
    await resolveReviewItem(admin, item.id, {
      action: "create_restaurant",
      payload: {
        restaurant: {
          name: "Fixture Dhaba",
          areaId: area.id,
          address: "G-9 Markaz",
          dishSlugs: ["chai"],
        },
      },
    });
    const created = await db.restaurant.findFirstOrThrow({ include: { dishes: true } });
    expect(created).toMatchObject({ source: "MANUAL", areaId: area.id, slug: "fixture-dhaba-g-9" });
    expect(created.dishes).toMatchObject([{ status: "CANDIDATE", source: "ADMIN" }]);
    expect(await db.reviewItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
      restaurantId: created.id,
    });

    await propose(actorOf(user), {
      type: "RESTAURANT",
      name: "Fixture Dhaba Again",
      cityId: city.id,
      areaId: area.id,
    });
    const dup = await openItem("RESTAURANT_PROPOSAL");
    expect(
      await resolveReviewItem(admin, dup.id, {
        action: "link_restaurant",
        payload: { restaurantId: created.id },
      }),
    ).toMatchObject({ resolution: "linked to fixture-dhaba-g-9" });
  });

  it("location suggestions: approve sets the panel location (PANEL_GPS); reject leaves it", async () => {
    const panel = await makeUser("Panel", { isPanel: true, trustScore: 1 });
    const r = await makeRestaurant("Fixture No Location");
    await recordLocationObservation(actorOf(panel), {
      restaurantId: r.id,
      lat: 33.7,
      lng: 73.05,
      accuracyM: 9,
    });
    const item = await openItem("LOCATION_SUGGESTION");
    await resolveReviewItem(admin, item.id, { action: "approve" }, NOW);
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
      lat: 33.7,
      lng: 73.05,
      locationSource: "PANEL_GPS",
    });

    const other = await makeRestaurant("Fixture Located", {
      lat: 33.6,
      lng: 73.0,
      locationSource: "OVERTURE",
    });
    await recordLocationObservation(actorOf(panel), {
      restaurantId: other.id,
      lat: 33.7,
      lng: 73.05,
      accuracyM: 9,
    });
    const far = await openItem("LOCATION_SUGGESTION");
    await resolveReviewItem(admin, far.id, { action: "reject" }, NOW);
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({
      lat: 33.6,
      locationSource: "OVERTURE",
    });
  });

  it("refuses actions that do not fit the item and types from later phases", async () => {
    const r = await makeRestaurant("Fixture Wrong");
    await rate(await oldUser(), r.id, "chai", { comment: "0300 1234567" });
    const item = await openItem("SUSPICIOUS_RATINGS");
    await expect(
      resolveReviewItem(admin, item.id, { action: "approve" }, NOW),
    ).rejects.toMatchObject({
      code: "ACTION_NOT_ALLOWED",
    });
    const duplicate = await db.reviewItem.create({
      data: { type: "DUPLICATE_RESTAURANT", payload: {} },
    });
    await expect(
      resolveReviewItem(admin, duplicate.id, { action: "keep_both" }, NOW),
    ).rejects.toMatchObject({
      code: "NOT_AVAILABLE",
    });
    // Phase 4: reports and disputes (FLAG) are decided by hand: done or dismissed, nothing else.
    const report = await db.reviewItem.create({
      data: { type: "FLAG", payload: { kind: "report", reason: "CLOSED" } },
    });
    await resolveReviewItem(admin, report.id, { action: "uphold" }, NOW);
    expect(await db.reviewItem.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({
      status: "RESOLVED",
      resolution: "done",
    });
  });
});
