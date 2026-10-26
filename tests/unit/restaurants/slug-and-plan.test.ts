import { describe, expect, it } from "vitest";
import {
  planClaimMerge,
  planDishMerge,
  planFlagMerge,
  planOwnerMerge,
  planRatingMerge,
  type MergeDish,
  type MergeRating,
} from "@/server/services/restaurant-merge";
import { restaurantSlugBase } from "@/server/services/restaurant.service";

describe("restaurant slugs", () => {
  it("does not repeat an area the name already ends with", () => {
    expect(restaurantSlugBase("Fixture Foods Blue Area", "blue-area")).toBe(
      "fixture-foods-blue-area",
    );
    expect(restaurantSlugBase("F-7", "f-7")).toBe("f-7");
  });

  it("falls back for names with no Latin letters and stays within 80 characters", () => {
    expect(restaurantSlugBase("کراچی", "f-7")).toBe("restaurant-f-7");
    const long = restaurantSlugBase("Very ".repeat(30) + "Long Name", "bahria-town-isb");
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("-bahria-town-isb")).toBe(true);
    expect(long).not.toMatch(/--/);
  });
});

const rd = (id: string, dishId: string, over: Partial<MergeDish> = {}): MergeDish => ({
  id,
  dishId,
  status: "CANDIDATE",
  distinctRaters: 0,
  price: null,
  variantTags: [],
  ...over,
});

describe("merge plan: dishes (docs/07 §2 step 1)", () => {
  it("moves dishes the target lacks and pairs shared ones", () => {
    const plan = planDishMerge(
      [rd("s1", "karahi"), rd("s2", "nihari")],
      [rd("t1", "karahi"), rd("t3", "haleem")],
    );
    expect(plan.move.map((d) => d.id)).toEqual(["s2"]);
    expect(plan.pairs.map((p) => [p.keep.id, p.drop.id])).toEqual([["t1", "s1"]]);
  });

  it("keeps the stronger status, then more raters; a full tie keeps the target's row", () => {
    const pair = (s: Partial<MergeDish>, t: Partial<MergeDish>) =>
      planDishMerge([rd("s", "d", s)], [rd("t", "d", t)]).pairs[0]!;
    expect(
      pair({ status: "MENU_VERIFIED" }, { status: "USER_CONFIRMED", distinctRaters: 40 }).keep.id,
    ).toBe("s");
    expect(pair({ status: "STALE" }, { status: "REMOVED" }).keep.id).toBe("s");
    expect(pair({ distinctRaters: 3 }, { distinctRaters: 2 }).keepFromSource).toBe(true);
    expect(pair({ distinctRaters: 2 }, { distinctRaters: 2 }).keep.id).toBe("t");
  });

  it("gives the kept row the lower non-null price and the union of tags", () => {
    const [p] = planDishMerge(
      [rd("s", "d", { status: "OWNER_VERIFIED", price: 2200, variantTags: ["desi", "white"] })],
      [rd("t", "d", { price: 1900, variantTags: ["white", "boneless"] })],
    ).pairs;
    expect(p).toMatchObject({ price: 1900, variantTags: ["desi", "white", "boneless"] });
    expect(
      planDishMerge([rd("s", "d", { price: null })], [rd("t", "d", { price: 900 })]).pairs[0]
        ?.price,
    ).toBe(900);
  });
});

const rating = (id: string, userId: string, updated: string): MergeRating => ({
  id,
  userId,
  score: 7,
  comment: null,
  createdAt: new Date(updated),
  updatedAt: new Date(updated),
});

describe("merge plan: ratings, flags, claims, owners (steps 2-4)", () => {
  it("keeps one rating per user: the newer; the older goes to history", () => {
    const plan = planRatingMerge(
      [rating("k1", "u1", "2026-10-01"), rating("k2", "u2", "2026-10-20")],
      [
        rating("d1", "u1", "2026-10-10"),
        rating("d2", "u2", "2026-10-05"),
        rating("d3", "u3", "2026-10-01"),
      ],
    );
    expect(plan.collisions.map((c) => [c.kept.id, c.older.id])).toEqual([
      ["d1", "k1"],
      ["k2", "d2"],
    ]);
    expect(plan.move.map((r) => r.id)).toEqual(["d1", "d3"]);
  });

  it("keeps the kept row's rating on an updatedAt tie", () => {
    const plan = planRatingMerge(
      [rating("k", "u", "2026-10-01")],
      [rating("d", "u", "2026-10-01")],
    );
    expect(plan.collisions[0]?.kept.id).toBe("k");
    expect(plan.move).toEqual([]);
  });

  it("drops a flag when the same user already flagged the kept row for the same reason", () => {
    expect(
      planFlagMerge(
        [{ id: "k", userId: "u1", reason: "NOT_SERVED" }],
        [
          { id: "d1", userId: "u1", reason: "NOT_SERVED" },
          { id: "d2", userId: "u1", reason: "WRONG_DISH" },
          { id: "d3", userId: "u2", reason: "NOT_SERVED" },
        ],
      ),
    ).toEqual({ move: ["d2", "d3"], drop: ["d1"] });
  });

  it("drops a claim by a user who already claimed the target", () => {
    expect(
      planClaimMerge(
        [{ id: "t1", userId: "u1" }],
        [
          { id: "s1", userId: "u1" },
          { id: "s2", userId: "u2" },
        ],
      ),
    ).toEqual({ move: ["s2"], drop: ["s1"] });
  });

  it("refuses different owners and moves a source-only owner", () => {
    expect(planOwnerMerge("o1", "o2")).toEqual({ conflict: true, moveToTarget: false });
    expect(planOwnerMerge("o1", null)).toEqual({ conflict: false, moveToTarget: true });
    expect(planOwnerMerge("o1", "o1")).toEqual({ conflict: false, moveToTarget: false });
    expect(planOwnerMerge(null, "o2")).toEqual({ conflict: false, moveToTarget: false });
  });
});
