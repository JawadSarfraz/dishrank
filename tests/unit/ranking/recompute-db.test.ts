import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { bayesScore, recomputeOne, rerankRestaurant } from "@/server/services/ranking.service";
import { mergeRestaurants, setRestaurantStatus } from "@/server/services/restaurant.service";
import { resetAppData } from "../../setup/db-reset";
import {
  ADMIN,
  daysAgo,
  dishId,
  makeDish,
  makeRating,
  makeRestaurant,
  makeUser,
  place,
} from "../restaurants/fixtures";

const NOW = new Date();

/** `n` raters (trust 0.6 unless given) each rating the row `score` at `ageDays`. */
async function rate(
  rdId: string,
  scores: number[],
  over: { trust?: number; ageDays?: number } = {},
) {
  for (const score of scores) {
    const user = await makeUser("Rater", { trustScore: over.trust ?? 0.6 });
    await makeRating(rdId, user.id, score, daysAgo(over.ageDays ?? 1, NOW));
  }
}

const row = (id: string) => db.restaurantDish.findUniqueOrThrow({ where: { id } });

async function launch(citySlug: string, daysAgoLaunched: number | null) {
  await db.city.update({
    where: { slug: citySlug },
    data: { launchedAt: daysAgoLaunched === null ? null : daysAgo(daysAgoLaunched, NOW) },
  });
}

describe("RankingService.recomputeOne (docs/04, test DB)", () => {
  beforeEach(async () => {
    await resetAppData();
    await launch("islamabad", null);
    await db.dishStat.deleteMany();
  });
  afterAll(async () => {
    await launch("islamabad", null);
    await db.$disconnect();
  });

  it("promotes CANDIDATE → USER_CONFIRMED at 3 distinct raters, not before", async () => {
    const r = await makeRestaurant("Fixture Karahi House");
    const rd = await makeDish(r, "chicken-karahi", { status: "CANDIDATE" });
    await rate(rd.id, [8, 9]);
    expect(await recomputeOne(rd.id, NOW)).toMatchObject({
      status: "CANDIDATE",
      votes: 2,
      promoted: false,
    });
    await rate(rd.id, [7]);
    const result = await recomputeOne(rd.id, NOW);
    expect(result).toMatchObject({ status: "USER_CONFIRMED", votes: 3, promoted: true });
    expect((await row(rd.id)).lastVerifiedAt).not.toBeNull();
  });

  it("counts only ACTIVE ratings of users who are not banned, with their current trust", async () => {
    const r = await makeRestaurant("Fixture Tikka");
    const rd = await makeDish(r, "chicken-tikka", { status: "USER_CONFIRMED" });
    const active = await makeUser("Active", { trustScore: 1 });
    const held = await makeUser("Held");
    const hidden = await makeUser("Hidden");
    const banned = await makeUser("Banned", { bannedAt: daysAgo(1, NOW) });
    await makeRating(rd.id, active.id, 9, NOW);
    await makeRating(rd.id, held.id, 1, NOW, { status: "HELD" });
    await makeRating(rd.id, hidden.id, 1, NOW, { status: "HIDDEN" });
    await makeRating(rd.id, banned.id, 1, NOW);

    const result = await recomputeOne(rd.id, NOW);
    expect(result).toMatchObject({ votes: 1, rawMean: 9, weightSum: 1 });
    // Prior 6.5 (no DishStat yet), W 1, R 9.
    expect(result?.score).toBeCloseTo(bayesScore(1, 9, 6.5), 3);
    const saved = await row(rd.id);
    expect(saved).toMatchObject({
      ratingCount: 1,
      distinctRaters: 1,
      weightSum: 1,
      weightedScoreSum: 9,
    });
    expect(Number(saved.rawMean)).toBe(9);
    expect(saved.lastRatedAt?.getTime()).toBe(NOW.getTime());
  });

  it("uses the city-dish mean as the prior once it rests on 50 ratings", async () => {
    const { city } = await place();
    const dish = await dishId("haleem");
    const r = await makeRestaurant("Fixture Haleem");
    const rd = await makeDish(r, "haleem", { status: "USER_CONFIRMED" });
    await rate(rd.id, [10], { trust: 1, ageDays: 0 }); // W = 1
    await db.dishStat.create({
      data: { cityId: city.id, dishId: dish, meanScore: 8.2, ratingCount: 49 },
    });
    expect((await recomputeOne(rd.id, NOW))?.score).toBeCloseTo(bayesScore(1, 10, 6.5), 3);
    await db.dishStat.update({
      where: { cityId_dishId: { cityId: city.id, dishId: dish } },
      data: { ratingCount: 50 },
    });
    expect((await recomputeOne(rd.id, NOW))?.score).toBeCloseTo(bayesScore(1, 10, 8.2), 3);
  });

  it("ranks in bootstrap with 4 raters and W ≥ 2.5; after launch + 60 days it needs 8 raters and W ≥ 5", async () => {
    const r = await makeRestaurant("Fixture Biryani");
    const rd = await makeDish(r, "chicken-biryani", { status: "USER_CONFIRMED" });
    await rate(rd.id, [9, 9, 8, 8], { trust: 0.7 }); // W ≈ 2.8
    expect(await recomputeOne(rd.id, NOW)).toMatchObject({
      eligible: true,
      rankInCity: 1,
      ratingsNeeded: 0,
      thresholds: { mode: "bootstrap", minRaters: 4 },
    });

    await launch("islamabad", 90);
    expect(await recomputeOne(rd.id, NOW)).toMatchObject({
      eligible: false,
      rankInCity: null,
      ratingsNeeded: 4, // 8 raters needed; the weight gap (5 - 2.8) / 0.6 also rounds up to 4
      thresholds: { mode: "normal", minRaters: 8 },
    });
    expect((await row(rd.id)).rankInCity).toBeNull();
  });

  it("orders ties by raters, then the latest rating, then the restaurant name; ranks stay city-wide", async () => {
    const rows: [string, string, { distinctRaters: number; lastRatedAt: Date }][] = [
      ["Zed Pizza", "f-7", { distinctRaters: 5, lastRatedAt: daysAgo(2, NOW) }],
      ["Alpha Pizza", "g-9", { distinctRaters: 5, lastRatedAt: daysAgo(2, NOW) }],
      ["More Raters Pizza", "f-7", { distinctRaters: 9, lastRatedAt: daysAgo(3, NOW) }],
      ["Fresh Pizza", "f-7", { distinctRaters: 5, lastRatedAt: daysAgo(1, NOW) }],
      ["Thin Pizza", "f-7", { distinctRaters: 3, lastRatedAt: daysAgo(1, NOW) }], // < 4 raters
    ];
    const ids: Record<string, string> = {};
    for (const [name, areaSlug, stats] of rows) {
      const r = await makeRestaurant(name, { areaSlug });
      const rd = await makeDish(r, "pizza", {
        status: "USER_CONFIRMED",
        score: 7.5,
        weightSum: 5,
        ratingCount: stats.distinctRaters,
        ...stats,
      });
      ids[name] = rd.id;
    }
    await rerankRestaurant((await row(ids["Zed Pizza"])).restaurantId, NOW);
    const rankOf = async (name: string) => (await row(ids[name])).rankInCity;
    expect(
      await Promise.all(
        ["More Raters Pizza", "Fresh Pizza", "Alpha Pizza", "Zed Pizza", "Thin Pizza"].map(rankOf),
      ),
    ).toEqual([1, 2, 3, 4, null]);
  });

  it("a closed restaurant loses its rank numbers and gets them back when active again", async () => {
    const r = await makeRestaurant("Fixture Nihari");
    const rd = await makeDish(r, "beef-nihari", { status: "USER_CONFIRMED" });
    await rate(rd.id, [9, 9, 9, 9], { trust: 1 });
    expect((await recomputeOne(rd.id, NOW))?.rankInCity).toBe(1);
    await setRestaurantStatus(ADMIN, r.id, "CLOSED");
    expect((await row(rd.id)).rankInCity).toBeNull();
    await setRestaurantStatus(ADMIN, r.id, "ACTIVE");
    expect((await row(rd.id)).rankInCity).toBe(1);
  });

  it("a merge recomputes the kept row from both restaurants' ratings", async () => {
    const target = await makeRestaurant("Fixture Chapli");
    const source = await makeRestaurant("Fixture Chapli Markaz");
    const keep = await makeDish(target, "chapli-kabab", { status: "USER_CONFIRMED" });
    const drop = await makeDish(source, "chapli-kabab", { status: "CANDIDATE" });
    await rate(keep.id, [8, 8], { trust: 1 });
    await rate(drop.id, [10, 10], { trust: 1 });
    await recomputeOne(keep.id, NOW);
    await mergeRestaurants(ADMIN, source.id, target.id);
    const kept = await row(keep.id);
    expect(kept).toMatchObject({ distinctRaters: 4, rankInCity: 1 });
    expect(Number(kept.rawMean)).toBe(9);
  });
});
