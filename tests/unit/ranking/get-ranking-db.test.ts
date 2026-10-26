import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getRanking, recomputeOne, rerankCityDishes } from "@/server/services/ranking.service";
import { resetAppData } from "../../setup/db-reset";
import { daysAgo, makeDish, makeRating, makeRestaurant, makeUser } from "../restaurants/fixtures";

const NOW = new Date();

/** One rater per score, each with the given trust, rating the row today. */
async function rate(rdId: string, scores: number[], trustScore: number) {
  for (const score of scores) {
    const user = await makeUser("Rater", { trustScore });
    await makeRating(rdId, user.id, score, daysAgo(0.5, NOW));
  }
  await recomputeOne(rdId, NOW);
}

describe("RankingService.getRanking (docs/04 ranking page query, test DB)", () => {
  beforeEach(async () => {
    await resetAppData();
    await db.dishStat.deleteMany();
  });
  afterAll(async () => {
    await resetAppData();
    await db.$disconnect();
  });

  it("splits ranked and 'not enough votes yet' rows, bootstrap then normal thresholds", async () => {
    const top = await makeRestaurant("Ranked Top", { areaSlug: "f-7" });
    const second = await makeRestaurant("Ranked Second", { areaSlug: "g-9" });
    const few = await makeRestaurant("Few Votes");
    const none = await makeRestaurant("No Votes");
    const stale = await makeRestaurant("Stale Row");
    const closed = await makeRestaurant("Closed Place", { status: "CLOSED" });
    const topRow = await makeDish(top, "chicken-karahi", { status: "USER_CONFIRMED" });
    const secondRow = await makeDish(second, "chicken-karahi", { status: "USER_CONFIRMED" });
    const fewRow = await makeDish(few, "chicken-karahi", { status: "CANDIDATE" });
    await makeDish(none, "chicken-karahi", { status: "CANDIDATE" });
    const staleRow = await makeDish(stale, "chicken-karahi", { status: "STALE" });
    const closedRow = await makeDish(closed, "chicken-karahi", { status: "USER_CONFIRMED" });
    await rate(topRow.id, [9, 9, 9, 9, 9], 1);
    await rate(secondRow.id, [7, 7, 7, 7, 7], 1);
    await rate(fewRow.id, [10, 10], 0.6);
    await rate(staleRow.id, [9, 9, 9, 9, 9], 1);
    await rate(closedRow.id, [10, 10, 10, 10, 10], 1);

    // Islamabad is not launched: bootstrap thresholds (4 raters, weight 2.5), "Early rankings".
    const early = await getRanking({ citySlug: "islamabad", dishSlug: "chicken-karahi" }, NOW);
    expect(early).toMatchObject({
      mode: "bootstrap",
      thresholds: { minRaters: 4, minWeight: 2.5 },
    });
    expect(early!.eligible.map((r) => [r.rank, r.restaurant.name, r.votes])).toEqual([
      [1, "Ranked Top", 5],
      [2, "Ranked Second", 5],
    ]);
    // Not ranked, by votes: 2 raters at 0.6 (W 1.2) need 3 more (2 raters, or weight 1.3 / 0.6);
    // none yet need 5 (4 × 0.6 = 2.4 < 2.5). Stale rows and closed restaurants are not listed.
    expect(early!.insufficient.map((r) => [r.restaurant.name, r.votes, r.ratingsNeeded])).toEqual([
      ["Few Votes", 2, 3],
      ["No Votes", 0, 5],
    ]);

    // An area filter narrows the list but never renumbers it (ranks are city-wide).
    const inG9 = await getRanking(
      { citySlug: "islamabad", dishSlug: "chicken-karahi", areaSlug: "g-9" },
      NOW,
    );
    expect(inG9!.eligible.map((r) => [r.rank, r.restaurant.name])).toEqual([[2, "Ranked Second"]]);

    // 61 days after launch: normal thresholds (8 raters, weight 5); the re-rank drops both ranks.
    await db.city.update({ where: { slug: "islamabad" }, data: { launchedAt: daysAgo(61, NOW) } });
    await rerankCityDishes([{ cityId: topRow.cityId, dishId: topRow.dishId }], NOW);
    const normal = await getRanking({ citySlug: "islamabad", dishSlug: "chicken-karahi" }, NOW);
    expect(normal).toMatchObject({ mode: "normal", thresholds: { minRaters: 8, minWeight: 5 } });
    expect(normal!.eligible).toEqual([]);
    // Equal votes and latest rating: by name.
    expect(normal!.insufficient.map((r) => [r.restaurant.name, r.ratingsNeeded])).toEqual([
      ["Ranked Second", 3],
      ["Ranked Top", 3],
      ["Few Votes", 7],
      ["No Votes", 9],
    ]);

    expect(await getRanking({ citySlug: "islamabad", dishSlug: "no-such-dish" }, NOW)).toBeNull();
  });
});
