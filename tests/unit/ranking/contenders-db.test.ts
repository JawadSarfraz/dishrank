// docs/01 D2a (2026-11-11): what a dish list shows. A place that only matches by a word in its name
// must stay off the lists until a person checked it, it got a counted rating, or it ranks; and the
// admin's curation (add to several dishes at once, remove, add back) must do exactly that.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getCityOverview } from "@/server/services/city-page.service";
import {
  addContenders,
  getContendersAdmin,
  setContenderRow,
} from "@/server/services/contenders.service";
import { getQuickRatePlaces } from "@/server/services/rate-page.service";
import { getRankingPage, recomputeOne } from "@/server/services/ranking.service";
import { searchRestaurants } from "@/server/services/restaurant.service";
import { resetAppData } from "../../setup/db-reset";
import {
  ADMIN,
  USER,
  daysAgo,
  makeDish,
  makeRating,
  makeRestaurant,
  makeUser,
} from "../restaurants/fixtures";

const NOW = new Date();
const karahi = { citySlug: "islamabad", dishSlug: "chicken-karahi" };
const page = (seed = "seed1") => getRankingPage(karahi, NOW, seed);

/** `n` established raters today, then the recompute that ranks the row in early rankings. */
async function rate(rowId: string, scores: number[], trustScore = 1) {
  for (const score of scores) {
    const rater = await makeUser("Rater", { trustScore });
    await makeRating(rowId, rater.id, score, daysAgo(0.5, NOW));
  }
  await recomputeOne(rowId, NOW);
}

describe("contenders (docs/01 D2a, test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("lists a place only when it ranks, has a counted rating, or its listing was checked", async () => {
    const auto = { source: "OVERTURE" as const, autoListedAt: daysAgo(2, NOW) };
    const unchecked = await makeRestaurant("Butt Karahi G-13", auto);
    const checked = await makeRestaurant("Butt Karahi F-8", {
      ...auto,
      checkedAt: daysAgo(1, NOW),
    });
    const byHand = await makeRestaurant("Tandoori F-10");
    const voted = await makeRestaurant("Monal", auto);
    const ranked = await makeRestaurant("Charsi Tikka", auto);
    const rows = new Map<string, string>();
    for (const r of [unchecked, checked, byHand, voted, ranked]) {
      const row = await makeDish(r, "chicken-karahi", { source: "AUTO_LIST", confidence: 0.3 });
      rows.set(r.name, row.id);
    }
    await rate(rows.get("Monal")!, [8]);
    await rate(rows.get("Charsi Tikka")!, [9, 9, 8, 9]);

    const ranking = (await page())!;
    expect(ranking.eligible.map((r) => r.restaurant.name)).toEqual(["Charsi Tikka"]);
    expect(ranking.insufficient.map((r) => r.restaurant.name)).toEqual(["Monal"]);
    expect(ranking.contenders.map((c) => c.name).sort()).toEqual([
      "Butt Karahi F-8",
      "Tandoori F-10",
    ]);
    expect(ranking).toMatchObject({ listedTotal: 4, contendersTotal: 2, shuffleSeed: "seed1" });

    // The quick-rate list shows the same places in the same order when it gets the page's seed.
    const quick = await getQuickRatePlaces(null, {
      city: "islamabad",
      dish: "chicken-karahi",
      seed: "seed1",
    });
    expect(quick.places.map((p) => p.name)).toEqual([
      "Charsi Tikka",
      "Monal",
      ...ranking.contenders.map((c) => c.name),
    ]);
    // Another seed may order the unrated ones differently, never the ranked or voted ones.
    const other = (await page("seed2"))!;
    expect(other.contenders.map((c) => c.name).sort()).toEqual([
      "Butt Karahi F-8",
      "Tandoori F-10",
    ]);

    // The home card counts the same four; the hidden place is still found by search.
    const overview = await getCityOverview("islamabad", NOW);
    expect(overview!.dishes.find((d) => d.slug === "chicken-karahi")).toMatchObject({
      ranked: 1,
      contenders: 4,
    });
    const found = await searchRestaurants({ city: "islamabad", q: "butt karahi" });
    expect(found.map((h) => h.name).sort()).toEqual(["Butt Karahi F-8", "Butt Karahi G-13"]);
  });

  it("an admin adds a place to two dishes at once, which checks the listing; removing drops it and its rank; adding back restores it", async () => {
    const r = await makeRestaurant("Savour Foods", {
      source: "OVERTURE",
      autoListedAt: daysAgo(2, NOW),
    });
    await expect(getContendersAdmin(USER, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      addContenders(ADMIN, { restaurantId: r.id, dishSlugs: ["no-such-dish"] }, NOW),
    ).rejects.toMatchObject({ code: "DISH_NOT_FOUND" });

    const added = await addContenders(
      ADMIN,
      { restaurantId: r.id, dishSlugs: ["chicken-karahi", "mutton-karahi"] },
      NOW,
    );
    expect(added.dishPages.map((p) => p.dishSlug).sort()).toEqual([
      "chicken-karahi",
      "mutton-karahi",
    ]);
    expect(
      (await db.restaurant.findUniqueOrThrow({ where: { id: r.id } })).checkedAt,
    ).not.toBeNull();
    const mutton = await getContendersAdmin(ADMIN, { city: "islamabad", dish: "mutton-karahi" });
    expect(mutton.contenders.map((c) => [c.name, c.checked])).toEqual([["Savour Foods", true]]);
    expect(
      (await getRankingPage(
        { citySlug: "islamabad", dishSlug: "mutton-karahi" },
        NOW,
        "s",
      ))!.contenders.map((c) => c.name),
    ).toEqual(["Savour Foods"]);

    // Ranked, then removed: it leaves the list and the ranking; its ratings stay stored.
    const row = await db.restaurantDish.findFirstOrThrow({
      where: { restaurantId: r.id, dish: { slug: "chicken-karahi" } },
    });
    await rate(row.id, [9, 9, 8, 9]);
    expect((await page())!.eligible.map((x) => x.restaurant.name)).toEqual(["Savour Foods"]);
    await setContenderRow(ADMIN, { restaurantDishId: row.id, action: "remove" }, NOW);
    const after = (await page())!;
    expect([after.eligible, after.insufficient, after.contenders]).toEqual([[], [], []]);
    const admin = await getContendersAdmin(ADMIN, { city: "islamabad", dish: "chicken-karahi" });
    expect(admin.contenders).toEqual([]);
    expect(admin.removed.map((x) => x.name)).toEqual(["Savour Foods"]);
    expect(await db.rating.count({ where: { restaurantDishId: row.id } })).toBe(4);

    // Added back as a candidate, its four raters promote and rank it again at once.
    await setContenderRow(ADMIN, { restaurantDishId: row.id, action: "restore" }, NOW);
    expect((await page())!.eligible.map((x) => [x.restaurant.name, x.rank])).toEqual([
      ["Savour Foods", 1],
    ]);
  });

  it("shows the linked places the rule keeps out, with why, and adding one checks the listing", async () => {
    const r = await makeRestaurant("Baba Butt Karahi", {
      source: "OVERTURE",
      autoListedAt: daysAgo(2, NOW),
    });
    const row = await makeDish(r, "chicken-karahi", { source: "AUTO_LIST", confidence: 0.3 });
    const before = await getContendersAdmin(ADMIN, { city: "islamabad", dish: "chicken-karahi" });
    expect(before.contenders).toEqual([]);
    expect(before.hidden.map((h) => [h.name, h.why])).toEqual([
      ["Baba Butt Karahi", "unchecked listing"],
    ]);
    const added = await addContenders(
      ADMIN,
      { restaurantId: r.id, dishSlugs: ["chicken-karahi"] },
      NOW,
    );
    expect(added.dishPages).toHaveLength(1);
    const after = await getContendersAdmin(ADMIN, { city: "islamabad", dish: "chicken-karahi" });
    expect(after.contenders.map((c) => c.id)).toEqual([row.id]);
    expect(after.hidden).toEqual([]);
  });
});
