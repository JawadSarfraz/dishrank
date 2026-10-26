// Phase 3 review follow-ups: what an admin decides on is what they saw (fingerprint), held ratings
// stay listed where they belong (burst, release, merge), and the races the review found.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/roles";
import { setPanel } from "@/server/services/admin-users.service";
import { recordLocationObservation } from "@/server/services/location.service";
import { addRestaurantDish, createOrReplace } from "@/server/services/rating.service";
import { mergeRestaurants } from "@/server/services/restaurant.service";
import { getReviewQueue, resolveReviewItem } from "@/server/services/review.service";
import { resetAppData } from "../../setup/db-reset";
import { fakeStorage } from "../storage/fake-storage";
import {
  actorOf,
  daysAgo,
  dishId,
  makeDish,
  makeRestaurant,
  makeUser,
} from "../restaurants/fixtures";

const NOW = new Date();
const HOUR = 3_600_000;
const photos = fakeStorage();
let admin: SessionUser;

const oldUser = (name = "Diner") => makeUser(name, { createdAt: daysAgo(30, NOW) });
const rate = async (
  user: Parameters<typeof actorOf>[0],
  restaurantId: string,
  dishSlug: string,
  over: Record<string, unknown> = {},
  now = NOW,
) =>
  createOrReplace(
    actorOf(user),
    { restaurantId, dishId: await dishId(dishSlug), score: 8, ...over },
    { now, storage: photos.adapter },
  );
const openItems = () =>
  db.reviewItem.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" } });
const reasonOf = (item: { payload: unknown }) => (item.payload as { reason: string }).reason;
const idsOf = (item: { payload: unknown }) => (item.payload as { ratingIds: string[] }).ratingIds;

describe("review follow-ups (test DB)", () => {
  beforeEach(async () => {
    await resetAppData();
    admin = actorOf(await makeUser("Admin", { role: "ADMIN" }));
  });
  afterAll(() => db.$disconnect());

  it("a decision on an item that changed since the admin saw it is refused (ITEM_CHANGED)", async () => {
    const r = await makeRestaurant("Fixture Fingerprint");
    const user = await oldUser();
    await rate(user, r.id, "chai", { comment: "Visit www.chai.pk" });
    const seen = (await getReviewQueue(admin, { status: "OPEN", limit: 50 }, NOW)).items[0];
    expect(seen.fingerprint).toMatch(/^[a-f0-9]{32}$/);
    // The author edits the held comment before the admin clicks.
    await rate(
      user,
      r.id,
      "chai",
      { comment: "WhatsApp 0300 1234567" },
      new Date(NOW.getTime() + 1000),
    );
    await expect(
      resolveReviewItem(admin, seen.id, { action: "release" }, NOW, seen.fingerprint),
    ).rejects.toMatchObject({ code: "ITEM_CHANGED", status: 409 });
    expect((await db.rating.findFirstOrThrow({ where: { userId: user.id } })).status).toBe("HELD");
    // Reloaded, the admin sees the new comment; deciding on it works and names the pages to refresh.
    const now = (await getReviewQueue(admin, { status: "OPEN", limit: 50 }, NOW)).items[0];
    expect(now.fingerprint).not.toBe(seen.fingerprint);
    expect(now.ratings[0].comment).toBe("WhatsApp 0300 1234567");
    const out = await resolveReviewItem(admin, now.id, { action: "hide" }, NOW, now.fingerprint);
    expect(out.dishPages).toEqual([
      { citySlug: "islamabad", dishSlug: "chai", restaurantSlug: r.slug },
    ]);
  });

  it("the burst item lists a young rating already held for its comment; releasing the comment leaves it held", async () => {
    const r = await makeRestaurant("Fixture Burst Lists All");
    const young = (i: number) => makeUser(`Young ${i}`, { createdAt: daysAgo(1, NOW) });
    const first = await rate(await young(0), r.id, "pizza", { comment: "call 0300 1234567" });
    for (let i = 1; i < 5; i++) await rate(await young(i), r.id, "pizza");
    const [comment, burst] = await openItems();
    expect([reasonOf(comment), reasonOf(burst)]).toEqual(["COMMENT", "BURST"]);
    expect(idsOf(burst)).toHaveLength(5);
    expect(idsOf(burst)).toContain(first.ratingId);

    await resolveReviewItem(admin, comment.id, { action: "release" }, NOW);
    expect((await db.rating.findUniqueOrThrow({ where: { id: first.ratingId } })).status).toBe(
      "HELD",
    );
    // Not recorded as released: the burst rule still counts it.
    const closed = await db.reviewItem.findUniqueOrThrow({ where: { id: comment.id } });
    expect(closed.payload).toMatchObject({ releasedRatingIds: [] });
    const out = await resolveReviewItem(admin, burst.id, { action: "release" }, NOW);
    expect(out.resolution).toBe("released 5");
    expect(await db.rating.count({ where: { status: "HELD" } })).toBe(0);
  });

  it("account age is taken when each rating arrived (docs/04 control 3)", async () => {
    const r = await makeRestaurant("Fixture Burst Age");
    const start = new Date(NOW.getTime() - 20 * HOUR);
    // Four accounts 6.5 days old rate; 14 hours later they are past 7 days, and a fifth rates.
    for (let i = 0; i < 4; i++) {
      const u = await makeUser(`Almost ${i}`, {
        createdAt: new Date(start.getTime() - 6.5 * 24 * HOUR),
      });
      await rate(u, r.id, "broast", {}, start);
    }
    const fifth = await makeUser("Fresh", { createdAt: daysAgo(3, NOW) });
    const out = await rate(fifth, r.id, "broast", {}, new Date(start.getTime() + 14 * HOUR));
    expect(out).toMatchObject({ held: true, heldReason: "BURST" });
    expect(await db.rating.count({ where: { status: "HELD" } })).toBe(5);
  });

  it("a merge keeps each user's counters right and moves held-rating items to the kept row", async () => {
    const realAdmin = admin;
    const source = await makeRestaurant("Fixture Merge Source");
    const target = await makeRestaurant("Fixture Merge Target");
    const both = await oldUser("Rated Both");
    await rate(both, source.id, "chai", {}, new Date(NOW.getTime() - 2 * HOUR));
    await rate(both, target.id, "chai", {}, new Date(NOW.getTime() - HOUR));
    // A held comment on each restaurant's chai: two open COMMENT items.
    const s = await rate(await oldUser("S"), source.id, "chai", { comment: "www.a.pk" });
    const t = await rate(await oldUser("T"), target.id, "chai", { comment: "www.b.pk" });
    expect((await db.user.findUniqueOrThrow({ where: { id: both.id } })).ratingsCount).toBe(2);

    await mergeRestaurants(realAdmin, source.id, target.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: both.id } })).ratingsCount).toBe(1);
    const open = await openItems();
    expect(open).toHaveLength(1);
    expect(open[0].payload).toMatchObject({
      restaurantDishId: t.restaurantDishId,
      reason: "COMMENT",
    });
    expect(idsOf(open[0]).sort()).toEqual([s.ratingId, t.ratingId].sort());
    const merged = await db.reviewItem.findFirstOrThrow({ where: { status: "RESOLVED" } });
    expect(merged.resolution).toBe(`merged into ${open[0].id}`);
    expect(merged.payload).toMatchObject({ restaurantDishId: t.restaurantDishId });
  });

  it("refuses dish adds on a REMOVED row and says when an edit stays hidden", async () => {
    const r = await makeRestaurant("Fixture Removed Add");
    await makeDish(r, "haleem", { status: "REMOVED" });
    const user = await oldUser();
    await expect(
      addRestaurantDish(actorOf(user), { restaurantId: r.id, dishId: await dishId("haleem") }),
    ).rejects.toMatchObject({ code: "DISH_REMOVED", status: 409 });

    const first = await rate(user, r.id, "chai", { comment: "www.x.pk" });
    await resolveReviewItem(admin, (await openItems())[0].id, { action: "hide" }, NOW);
    const edit = await rate(user, r.id, "chai", { score: 9 }, new Date(NOW.getTime() + 1000));
    expect(edit).toMatchObject({ ratingId: first.ratingId, status: "HIDDEN", held: true });
  });

  it("one photo stays on one rating, also when two ratings with it are saved at once", async () => {
    const r = await makeRestaurant("Fixture Photo Race");
    const user = await oldUser();
    photos.objects[`${user.id}/same1.webp`] = { size: 200_000, contentType: "image/webp" };
    const photoPath = `dish-photos/${user.id}/same1.webp`;
    const results = await Promise.allSettled([
      rate(user, r.id, "chai", { photoPath }),
      rate(user, r.id, "pizza", { photoPath }),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "PHOTO_IN_USE", status: 409 });
    expect(await db.rating.count({ where: { photoPath } })).toBe(1);
  });

  it("a comment edit that keeps the same flag still changes the fingerprint (updatedAt)", async () => {
    const r = await makeRestaurant("Fixture Same Flag");
    const user = await oldUser();
    await rate(user, r.id, "chai", { comment: "Visit www.chai.pk" });
    const seen = (await getReviewQueue(admin, { status: "OPEN", limit: 50 }, NOW)).items[0];
    await rate(user, r.id, "chai", { comment: "Visit www.tea.pk" }, new Date(NOW.getTime() + 1000));
    const item = await db.reviewItem.findUniqueOrThrow({ where: { id: seen.id } });
    expect(item.payload).toEqual(seen.payload); // same flag: only the rating changed
    await expect(
      resolveReviewItem(admin, seen.id, { action: "release" }, NOW, seen.fingerprint),
    ).rejects.toMatchObject({ code: "ITEM_CHANGED" });
  });

  it("a location card's fingerprint covers the restaurant's current location", async () => {
    const panel = await makeUser("Panel", { isPanel: true, trustScore: 1.3 });
    const r = await makeRestaurant("Fixture Location Seen");
    await recordLocationObservation(
      actorOf(panel),
      { restaurantId: r.id, lat: 33.7, lng: 73.05, accuracyM: 9 },
      NOW,
    );
    const seen = (await getReviewQueue(admin, { status: "OPEN", limit: 50 }, NOW)).items[0];
    // Another admin types the restaurant's location meanwhile.
    await db.restaurant.update({
      where: { id: r.id },
      data: { lat: 33.71, lng: 73.06, locationSource: "ADMIN" },
    });
    await expect(
      resolveReviewItem(admin, seen.id, { action: "approve" }, NOW, seen.fingerprint),
    ).rejects.toMatchObject({ code: "ITEM_CHANGED" });
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
      locationSource: "ADMIN",
    });
  });

  it("a burst release clears its ratings for the burst rule, also ones still held for a comment", async () => {
    const r = await makeRestaurant("Fixture Burst Clear");
    const young = (i: number) => makeUser(`Young ${i}`, { createdAt: daysAgo(1, NOW) });
    for (let i = 0; i < 5; i++) {
      await rate(await young(i), r.id, "pizza", { comment: `www.p${i}.pk` });
    }
    const burst = (await openItems()).find((i) => reasonOf(i) === "BURST")!;
    expect(idsOf(burst)).toHaveLength(5);
    const out = await resolveReviewItem(admin, burst.id, { action: "release" }, NOW);
    expect(out.resolution).toBe("released 0"); // all five wait for their comment item
    // A sixth young account: the five are cleared of the burst, so no burst item opens again.
    await rate(await young(5), r.id, "pizza");
    expect((await openItems()).filter((i) => reasonOf(i) === "BURST")).toHaveLength(0);
    expect(await db.rating.count({ where: { status: "HELD" } })).toBe(5);
  });

  it("a ban hides every rating of the user and names every page whose scores changed", async () => {
    const user = await oldUser("Banned");
    const a = await makeRestaurant("Fixture Ban A");
    const b = await makeRestaurant("Fixture Ban B");
    await rate(user, a.id, "chai");
    await rate(user, b.id, "pizza", { comment: "www.spam.pk" });
    const out = await resolveReviewItem(
      admin,
      (await openItems())[0].id,
      { action: "ban_users" },
      NOW,
    );
    expect(await db.rating.count({ where: { userId: user.id, status: { not: "HIDDEN" } } })).toBe(
      0,
    );
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).bannedAt).not.toBeNull();
    expect(out.dishPages.map((p) => p.restaurantSlug).sort()).toEqual([a.slug, b.slug].sort());
  });

  it("a hide names the pages of the rows the user's new trust recomputed", async () => {
    const user = await oldUser("Hidden Twice");
    const p = await makeRestaurant("Fixture Trust P");
    const r1 = await makeRestaurant("Fixture Trust R1");
    const r2 = await makeRestaurant("Fixture Trust R2");
    await rate(user, p.id, "chai");
    await rate(user, r1.id, "chai", { comment: "www.a.pk" });
    await resolveReviewItem(admin, (await openItems())[0].id, { action: "hide" }, NOW);
    await rate(user, r2.id, "chai", { comment: "www.b.pk" });
    const out = await resolveReviewItem(admin, (await openItems())[0].id, { action: "hide" }, NOW);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).trustScore).toBe(0.3);
    expect(out.dishPages.map((x) => x.restaurantSlug)).toEqual(
      expect.arrayContaining([p.slug, r2.slug]),
    );
  });

  it("the panel toggle names the public pages whose scores changed", async () => {
    const r = await makeRestaurant("Fixture Panel Pages");
    const user = await oldUser();
    await rate(user, r.id, "chai");
    const out = await setPanel(admin, user.id, true);
    expect(out.dishPages).toEqual([
      { citySlug: "islamabad", dishSlug: "chai", restaurantSlug: r.slug },
    ]);
  });
});
