import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { bucketSeconds, RATE_LIMITS } from "@/server/rate-limit";
import { addRestaurantDish, createOrReplace, deleteOwn } from "@/server/services/rating.service";
import { resetAppData } from "../../setup/db-reset";
import {
  actorOf,
  daysAgo,
  dishId,
  makeDish,
  makeRestaurant,
  makeUser,
} from "../restaurants/fixtures";

const NOW = new Date();

/** An account old enough to be outside the burst rule (docs/04: younger than 7 days counts). */
const oldUser = (name = "Diner", over = {}) =>
  makeUser(name, { createdAt: daysAgo(30, NOW), ...over });
const newUser = (name = "New", over = {}) =>
  makeUser(name, { createdAt: daysAgo(1, NOW), ...over });

async function rate(
  user: { id: string; email: string; name: string; role: string },
  restaurantId: string,
  dishSlug: string,
  over: Record<string, unknown> = {},
) {
  return createOrReplace(
    actorOf(user),
    { restaurantId, dishId: await dishId(dishSlug), score: 8, ...over },
    { now: NOW },
  );
}

/** Pretends `count` submissions already happened today under `key`. */
async function used(key: string, count: number, windowSeconds = 86_400) {
  const size = bucketSeconds(windowSeconds) * 1000;
  const windowStart = new Date(Math.floor(NOW.getTime() / size) * size);
  await db.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count },
    update: { count: { increment: count } },
  });
}

describe("RatingService (docs/04 abuse controls, test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("needs a signed-in, unbanned user", async () => {
    const r = await makeRestaurant("Fixture Karahi");
    await expect(
      createOrReplace(null, {
        restaurantId: r.id,
        dishId: await dishId("chicken-karahi"),
        score: 8,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const banned = await oldUser("Banned", { bannedAt: daysAgo(1, NOW) });
    await expect(rate(banned, r.id, "chicken-karahi")).rejects.toMatchObject({
      code: "USER_BANNED",
    });
  });

  it("rates only ACTIVE restaurants and canonical dishes", async () => {
    const user = await oldUser();
    const closed = await makeRestaurant("Fixture Closed", { status: "CLOSED" });
    await expect(rate(user, closed.id, "chicken-karahi")).rejects.toMatchObject({
      code: "RESTAURANT_INACTIVE",
      status: 409,
    });
    const r = await makeRestaurant("Fixture Open");
    await expect(
      createOrReplace(actorOf(user), { restaurantId: r.id, dishId: "nosuchdish0000", score: 8 }),
    ).rejects.toMatchObject({ code: "DISH_NOT_FOUND" });
  });

  it("an owner cannot rate their own restaurant, panel members included", async () => {
    const owner = await oldUser("Owner", { role: "OWNER" });
    const panelOwner = await oldUser("Panel owner", { isPanel: true, trustScore: 1.3 });
    const mine = await makeRestaurant("Fixture Mine", { claimedByUserId: owner.id });
    const panels = await makeRestaurant("Fixture Panel Owned", { claimedByUserId: panelOwner.id });
    await expect(rate(owner, mine.id, "chicken-karahi")).rejects.toMatchObject({
      code: "OWNER_SELF_RATING",
      status: 403,
    });
    await expect(rate(panelOwner, panels.id, "chicken-karahi")).rejects.toMatchObject({
      code: "OWNER_SELF_RATING",
    });
    expect(await db.rating.count()).toBe(0);
    // Someone else's restaurant is fine.
    await expect(rate(owner, panels.id, "chicken-karahi")).resolves.toMatchObject({
      created: true,
    });
  });

  it("adds a dish the restaurant does not list yet as CANDIDATE / USER / 0.5", async () => {
    const user = await oldUser();
    const r = await makeRestaurant("Fixture Grill");
    const result = await rate(user, r.id, "chicken-tikka");
    const row = await db.restaurantDish.findUniqueOrThrow({
      where: { id: result.restaurantDishId },
    });
    expect(row).toMatchObject({
      status: "CANDIDATE",
      source: "USER",
      confidence: 0.5,
      ratingCount: 1,
    });
    expect(result).toMatchObject({
      created: true,
      held: false,
      votes: 1,
      eligible: false,
      rank: null,
      // Bootstrap needs 4 raters and W 2.5: one 0.6 rater leaves a weight gap of 1.9, i.e. 4 more
      // fresh new-account ratings (4 × 0.6 = 2.4 would still fall short of 2.5 with only 4 raters).
      ratingsNeeded: 4,
      mode: "bootstrap",
      restaurant: { id: r.id },
      dish: { slug: "chicken-tikka" },
    });
    // An existing row is reused, whatever added it.
    const added = await addRestaurantDish(actorOf(user), {
      restaurantId: r.id,
      dishId: await dishId("chicken-tikka"),
    });
    expect(added).toMatchObject({ id: row.id, created: false });
  });

  it("re-rating replaces the rating and keeps the old one in RatingHistory", async () => {
    const user = await oldUser();
    const r = await makeRestaurant("Fixture Pulao");
    const first = await rate(user, r.id, "kabuli-pulao", { score: 6, comment: "salty" });
    const second = await rate(user, r.id, "kabuli-pulao", { score: 9, taste: 5 });
    expect(second).toMatchObject({ ratingId: first.ratingId, created: false, votes: 1 });
    const rating = await db.rating.findUniqueOrThrow({ where: { id: first.ratingId } });
    expect(rating).toMatchObject({ score: 9, taste: 5, comment: null, status: "ACTIVE" });
    const history = await db.ratingHistory.findMany({ where: { ratingId: first.ratingId } });
    expect(history.map((h) => [h.score, h.comment])).toEqual([[6, "salty"]]);
    expect(await db.rating.count()).toBe(1);
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      ratingsCount: 1,
    });
  });

  it("holds a rating whose comment has a phone number or link, with a review item; it never counts", async () => {
    const user = await oldUser();
    const other = await oldUser("Other");
    const r = await makeRestaurant("Fixture Chai");
    const held = await rate(user, r.id, "chai", { comment: "Order on 0300 1234567" });
    expect(held).toMatchObject({ held: true, heldReason: "COMMENT", votes: 0 });
    const linky = await rate(other, r.id, "chai", { comment: "menu at chai-dhaba.pk" });
    expect(linky).toMatchObject({ held: true, heldReason: "COMMENT" });
    const items = await db.reviewItem.findMany({ where: { type: "SUSPICIOUS_RATINGS" } });
    expect(items).toHaveLength(1); // one open item per dish row and reason
    expect(items[0].payload).toMatchObject({
      restaurantDishId: held.restaurantDishId,
      reason: "COMMENT",
      ratingIds: [held.ratingId, linky.ratingId],
      flags: ["PHONE", "LINK"],
    });
    // Editing does not release a held rating: only an admin does.
    const edited = await rate(user, r.id, "chai", { comment: "Great chai" });
    expect(edited).toMatchObject({ held: true, votes: 0 });
    expect((await db.rating.findUniqueOrThrow({ where: { id: held.ratingId } })).status).toBe(
      "HELD",
    );
  });

  it("burst rule: the 5th rating within 24 h from accounts under 7 days old holds all five", async () => {
    const r = await makeRestaurant("Fixture Burst");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rate(await newUser(`New ${i}`), r.id, "broast"));
    expect(results.every((x) => !x.held)).toBe(true);
    expect(results[3].votes).toBe(4);

    const fifth = await rate(await newUser("New 4"), r.id, "broast");
    expect(fifth).toMatchObject({ held: true, heldReason: "BURST", votes: 0 });
    const ratings = await db.rating.findMany({
      where: { restaurantDishId: fifth.restaurantDishId },
    });
    expect(ratings.map((x) => x.status)).toEqual(Array(5).fill("HELD"));
    const [item] = await db.reviewItem.findMany({ where: { type: "SUSPICIOUS_RATINGS" } });
    expect(item.payload).toMatchObject({ reason: "BURST" });
    expect((item.payload as { ratingIds: string[] }).ratingIds).toHaveLength(5);

    // A 6th new account joins the same item; an older account is not held.
    const sixth = await rate(await newUser("New 5"), r.id, "broast");
    expect(sixth).toMatchObject({ held: true, heldReason: "BURST" });
    expect(
      ((await db.reviewItem.findFirstOrThrow()).payload as { ratingIds: string[] }).ratingIds,
    ).toHaveLength(6);
    const veteran = await rate(await oldUser("Veteran"), r.id, "broast");
    expect(veteran).toMatchObject({ held: false, votes: 1 });
  });

  it("burst rule: panel members and older accounts never count toward it", async () => {
    const r = await makeRestaurant("Fixture Panel Burst");
    for (let i = 0; i < 3; i++) {
      await rate(await newUser(`Panel ${i}`, { isPanel: true, trustScore: 1.3 }), r.id, "pizza");
    }
    for (let i = 0; i < 3; i++) await rate(await oldUser(`Old ${i}`), r.id, "pizza");
    const fourNew = [];
    for (let i = 0; i < 4; i++) fourNew.push(await rate(await newUser(`New ${i}`), r.id, "pizza"));
    expect(fourNew.every((x) => !x.held)).toBe(true);
    expect(fourNew[3].votes).toBe(10);
    expect(await db.reviewItem.count()).toBe(0);
  });

  it("rate limits: 15 a day and 3 per restaurant; panel members get 30 and 10", async () => {
    const user = await oldUser();
    const panel = await oldUser("Panel", { isPanel: true, trustScore: 1.3 });
    const r = await makeRestaurant("Fixture Limits");
    const other = await makeRestaurant("Fixture Limits Two");

    await used(`user:${user.id}:rating:restaurant:${r.id}`, 3);
    await expect(rate(user, r.id, "pizza")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
    await expect(rate(user, other.id, "pizza")).resolves.toMatchObject({ created: true });
    await used(`user:${user.id}:rating`, 15);
    await expect(rate(user, other.id, "broast")).rejects.toMatchObject({ code: "RATE_LIMITED" });

    await used(`user:${panel.id}:rating:restaurant:${r.id}`, 9);
    await used(`user:${panel.id}:rating`, 20);
    await expect(rate(panel, r.id, "pizza")).resolves.toMatchObject({ created: true }); // 10th, 21st
    await expect(rate(panel, r.id, "broast")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(RATE_LIMITS.ratingPanel.limit).toBe(30);
  });

  it("deleteOwn removes only the user's own rating, with its history, and recomputes", async () => {
    const user = await oldUser();
    const other = await oldUser("Other");
    const r = await makeRestaurant("Fixture Delete");
    const mine = await rate(user, r.id, "haleem", { score: 6 });
    await rate(user, r.id, "haleem", { score: 7 }); // history row
    const theirs = await rate(other, r.id, "haleem");
    await expect(deleteOwn(actorOf(other), mine.ratingId, { now: NOW })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const deleted = await deleteOwn(actorOf(user), mine.ratingId, { now: NOW });
    expect(deleted).toMatchObject({ id: mine.ratingId, dishSlug: "haleem" });
    expect(await db.rating.findUnique({ where: { id: mine.ratingId } })).toBeNull();
    expect(await db.ratingHistory.count()).toBe(0);
    const row = await db.restaurantDish.findUniqueOrThrow({
      where: { id: theirs.restaurantDishId },
    });
    expect(row).toMatchObject({ ratingCount: 1 });
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      ratingsCount: 0,
    });
  });

  it("refuses a REMOVED dish row, revives a STALE one, and checks the photo's owner", async () => {
    const user = await oldUser();
    const r = await makeRestaurant("Fixture Lifecycle");
    await makeDish(r, "beef-nihari", { status: "REMOVED" });
    await expect(rate(user, r.id, "beef-nihari")).rejects.toMatchObject({ code: "DISH_REMOVED" });
    const stale = await makeDish(r, "haleem", { status: "STALE" });
    await rate(user, r.id, "haleem");
    expect((await db.restaurantDish.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe(
      "USER_CONFIRMED",
    );
    await expect(
      rate(user, r.id, "pizza", { photoPath: "dish-photos/someoneelse0/abc123.webp" }),
    ).rejects.toMatchObject({ code: "PHOTO_NOT_YOURS" });
    const withPhoto = await rate(user, r.id, "pizza", {
      photoPath: `dish-photos/${user.id}/abc123.webp`,
    });
    expect(withPhoto.created).toBe(true);
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      ratingsCount: 2,
      photoRatings: 1,
    });
  });
});
