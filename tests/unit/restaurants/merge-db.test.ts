import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getPublicRestaurant, mergeRestaurants } from "@/server/services/restaurant.service";
import { resetAppData } from "../../setup/db-reset";
import { ADMIN, USER, daysAgo, makeDish, makeRating, makeRestaurant, makeUser } from "./fixtures";

/**
 * Source S and target T share chicken-karahi (S's row is stronger) and a rater (u1, who rated
 * both); S also serves mutton-karahi, T also serves haleem. S is claimed and was created from an
 * Overture place (its id, location and candidate row); T has no location.
 */
async function scenario() {
  const [u1, u2, u3, owner] = [
    await makeUser("u1"),
    await makeUser("u2"),
    await makeUser("u3"),
    await makeUser("owner"),
  ];
  const target = await makeRestaurant("Fixture Karahi");
  const source = await makeRestaurant("Fixture Karahi Markaz", {
    source: "OVERTURE",
    overtureId: "08f-fixture-source",
    lat: 33.7212,
    lng: 73.0571,
    locationSource: "OVERTURE",
    claimedByUserId: owner.id,
    claimedAt: daysAgo(2),
  });
  const sKarahi = await makeDish(source, "chicken-karahi", {
    status: "MENU_VERIFIED",
    source: "MENU_PHOTO",
    distinctRaters: 2,
    price: 2200,
    variantTags: ["desi"],
  });
  const tKarahi = await makeDish(target, "chicken-karahi", {
    distinctRaters: 2,
    price: 1900,
    variantTags: ["white", "desi"],
  });
  const sMutton = await makeDish(source, "mutton-karahi");
  const tHaleem = await makeDish(target, "haleem");

  const u1Old = await makeRating(sKarahi.id, u1.id, 6, daysAgo(10), { comment: "salty" });
  await db.ratingHistory.create({ data: { ratingId: u1Old.id, score: 4, createdAt: daysAgo(40) } });
  const u2Rating = await makeRating(sKarahi.id, u2.id, 8, daysAgo(20));
  const u1New = await makeRating(tKarahi.id, u1.id, 9, daysAgo(1));
  const u3Rating = await makeRating(tKarahi.id, u3.id, 7, daysAgo(3));

  const keptFlag = await db.flag.create({
    data: { restaurantDishId: sKarahi.id, userId: u2.id, reason: "NOT_SERVED" },
  });
  const dupFlag = await db.flag.create({
    data: { restaurantDishId: tKarahi.id, userId: u2.id, reason: "NOT_SERVED" },
  });
  const movedFlag = await db.flag.create({
    data: { restaurantDishId: tKarahi.id, userId: u3.id, reason: "WRONG_DISH" },
  });

  const upload = await db.menuUpload.create({
    data: { restaurantId: source.id, uploadedByUserId: u2.id, filePath: "menus/x/y.jpg" },
  });
  const ownerClaim = await db.ownerClaim.create({
    data: { restaurantId: source.id, userId: owner.id, phone: "03001234567", status: "APPROVED" },
  });
  const dupClaim = await db.ownerClaim.create({
    data: { restaurantId: source.id, userId: u3.id, phone: "03001234567" },
  });
  await db.ownerClaim.create({
    data: { restaurantId: target.id, userId: u3.id, phone: "03001234567" },
  });
  const openItem = await db.reviewItem.create({
    data: { type: "FLAG", restaurantId: source.id, payload: {} },
  });
  const closedItem = await db.reviewItem.create({
    data: { type: "FLAG", status: "RESOLVED", restaurantId: source.id, payload: {} },
  });
  const candidate = await db.overtureCandidate.create({
    data: {
      overtureId: "08f-fixture-source",
      release: "2026-10-21.0",
      lastSeenRelease: "2026-10-21.0",
      cityId: source.cityId,
      name: "Fixture Karahi Markaz",
      confidence: 0.8,
      sources: ["meta"],
      status: "CREATED",
      restaurantId: source.id,
    },
  });

  return {
    users: { u1, u2, u3, owner },
    source,
    target,
    dishes: { sKarahi, tKarahi, sMutton, tHaleem },
    ratings: { u1Old, u2Rating, u1New, u3Rating },
    flags: { keptFlag, dupFlag, movedFlag },
    upload,
    claims: { ownerClaim, dupClaim },
    items: { openItem, closedItem },
    candidate,
  };
}

describe("RestaurantService.mergeRestaurants (docs/07 §2, test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("merges a shared dish and a shared rater, moves everything and redirects the old slug", async () => {
    const s = await scenario();
    const recomputed: string[][] = [];
    const result = await mergeRestaurants(ADMIN, s.source.id, s.target.id, async (ids) => {
      recomputed.push([...ids]);
    });

    // Dishes: S's stronger chicken-karahi row survives on T with the lower price and both tags.
    const dishes = await db.restaurantDish.findMany({
      where: { restaurantId: s.target.id },
      include: { dish: true },
      orderBy: { dish: { slug: "asc" } },
    });
    expect(dishes.map((d) => [d.dish.slug, d.id])).toEqual([
      ["chicken-karahi", s.dishes.sKarahi.id],
      ["haleem", s.dishes.tHaleem.id],
      ["mutton-karahi", s.dishes.sMutton.id],
    ]);
    expect(dishes[0]).toMatchObject({
      status: "MENU_VERIFIED",
      price: 1900,
      variantTags: ["desi", "white"],
    });
    expect(await db.restaurantDish.findUnique({ where: { id: s.dishes.tKarahi.id } })).toBeNull();
    expect(await db.restaurantDish.count({ where: { restaurantId: s.source.id } })).toBe(0);

    // Ratings: one per user; u1 keeps the newer rating, the older one is in its history.
    const ratings = await db.rating.findMany({
      where: { restaurantDishId: s.dishes.sKarahi.id },
      orderBy: { score: "asc" },
    });
    expect(ratings.map((r) => [r.id, r.score])).toEqual([
      [s.ratings.u3Rating.id, 7],
      [s.ratings.u2Rating.id, 8],
      [s.ratings.u1New.id, 9],
    ]);
    expect(await db.rating.findUnique({ where: { id: s.ratings.u1Old.id } })).toBeNull();
    const history = await db.ratingHistory.findMany({
      where: { ratingId: s.ratings.u1New.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((h) => [h.score, h.comment])).toEqual([
      [4, null], // the older rating's own history moved over
      [6, "salty"], // the older rating itself
    ]);
    // Moving ratings does not touch their decay clock.
    const u3 = ratings.find((r) => r.id === s.ratings.u3Rating.id)!;
    expect(u3.updatedAt.toISOString()).toBe(s.ratings.u3Rating.updatedAt.toISOString());

    // Flags: the duplicate (same user + reason) is dropped, the other moves.
    const flags = await db.flag.findMany({ where: { restaurantDishId: s.dishes.sKarahi.id } });
    expect(flags.map((f) => f.id).sort()).toEqual(
      [s.flags.keptFlag.id, s.flags.movedFlag.id].sort(),
    );

    // Menu uploads, claims, open review items.
    expect(
      (await db.menuUpload.findUniqueOrThrow({ where: { id: s.upload.id } })).restaurantId,
    ).toBe(s.target.id);
    expect(
      (await db.ownerClaim.findUniqueOrThrow({ where: { id: s.claims.ownerClaim.id } }))
        .restaurantId,
    ).toBe(s.target.id);
    expect(await db.ownerClaim.findUnique({ where: { id: s.claims.dupClaim.id } })).toBeNull();
    expect(
      (await db.reviewItem.findUniqueOrThrow({ where: { id: s.items.openItem.id } })).restaurantId,
    ).toBe(s.target.id);
    expect(
      (await db.reviewItem.findUniqueOrThrow({ where: { id: s.items.closedItem.id } }))
        .restaurantId,
    ).toBe(s.source.id);

    // Overture id, location and owner move; the source becomes a duplicate.
    const [source, target] = await Promise.all([
      db.restaurant.findUniqueOrThrow({ where: { id: s.source.id } }),
      db.restaurant.findUniqueOrThrow({ where: { id: s.target.id } }),
    ]);
    expect(source).toMatchObject({
      status: "DUPLICATE",
      mergedIntoId: s.target.id,
      overtureId: null,
      claimedByUserId: null,
    });
    expect(target).toMatchObject({
      status: "ACTIVE",
      overtureId: "08f-fixture-source",
      lat: 33.7212,
      lng: 73.0571,
      locationSource: "OVERTURE",
      claimedByUserId: s.users.owner.id,
    });
    expect(
      (await db.overtureCandidate.findUniqueOrThrow({ where: { id: s.candidate.id } }))
        .restaurantId,
    ).toBe(s.target.id);
    expect(result).toMatchObject({
      overtureIdMoved: true,
      locationMoved: true,
      movedCandidates: 1,
    });

    // After commit: recompute the kept row whose ratings changed; the old slug redirects.
    expect(recomputed).toEqual([[s.dishes.sKarahi.id]]);
    expect(result.mergedRatings).toEqual([
      { keptId: s.ratings.u1New.id, droppedId: s.ratings.u1Old.id },
    ]);
    expect(await getPublicRestaurant(s.source.slug)).toEqual({
      kind: "redirect",
      slug: s.target.slug,
      citySlug: "islamabad",
    });
  });

  it("keeps the target's own Overture id and location", async () => {
    const target = await makeRestaurant("Fixture Tikka", {
      overtureId: "08f-fixture-target",
      lat: 33.7,
      lng: 73.05,
      locationSource: "ADMIN",
    });
    const source = await makeRestaurant("Fixture Tikka Two", {
      overtureId: "08f-fixture-two",
      lat: 33.71,
      lng: 73.06,
      locationSource: "OVERTURE",
    });
    const result = await mergeRestaurants(ADMIN, source.id, target.id);
    expect(result).toMatchObject({ overtureIdMoved: false, locationMoved: false });
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
      overtureId: "08f-fixture-target",
      lat: 33.7,
      lng: 73.05,
      locationSource: "ADMIN",
    });
    // The duplicate keeps its own Overture id, so a later sync still knows the place.
    expect((await db.restaurant.findUniqueOrThrow({ where: { id: source.id } })).overtureId).toBe(
      "08f-fixture-two",
    );
  });

  it("follows merge chains to the surviving restaurant", async () => {
    const a = await makeRestaurant("A Karahi");
    const b = await makeRestaurant("B Karahi");
    const c = await makeRestaurant("C Karahi");
    await mergeRestaurants(ADMIN, a.id, b.id);
    await mergeRestaurants(ADMIN, b.id, c.id);
    expect(await getPublicRestaurant(a.slug)).toMatchObject({ kind: "redirect", slug: c.slug });
  });

  it("stops on different owners and rolls everything back", async () => {
    const [o1, o2] = [await makeUser("o1"), await makeUser("o2")];
    const target = await makeRestaurant("T", { claimedByUserId: o1.id });
    const source = await makeRestaurant("S", { claimedByUserId: o2.id });
    const sDish = await makeDish(source, "haleem");
    await expect(mergeRestaurants(ADMIN, source.id, target.id)).rejects.toMatchObject({
      code: "MERGE_CONFLICTING_OWNERS",
    });
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: source.id } })).toMatchObject({
      status: "ACTIVE",
      mergedIntoId: null,
    });
    expect(
      (await db.restaurantDish.findUniqueOrThrow({ where: { id: sDish.id } })).restaurantId,
    ).toBe(source.id);
  });

  it("refuses self, cross-city, already-merged and non-admin merges", async () => {
    const a = await makeRestaurant("A");
    const b = await makeRestaurant("B");
    const pindi = await makeRestaurant("P", { citySlug: "rawalpindi", areaSlug: "saddar" });
    await expect(mergeRestaurants(ADMIN, a.id, a.id)).rejects.toMatchObject({
      code: "MERGE_SAME_RESTAURANT",
    });
    await expect(mergeRestaurants(ADMIN, a.id, pindi.id)).rejects.toMatchObject({
      code: "MERGE_CITY_MISMATCH",
    });
    await expect(mergeRestaurants(USER, a.id, b.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await mergeRestaurants(ADMIN, a.id, b.id);
    await expect(mergeRestaurants(ADMIN, a.id, b.id)).rejects.toMatchObject({
      code: "RESTAURANT_MERGED",
    });
  });
});
