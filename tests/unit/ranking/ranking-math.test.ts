import { describe, expect, it } from "vitest";
import { RANKING } from "@/server/services/ranking.constants";
import {
  aggregateRatings,
  bayesScore,
  cityPrior,
  isEligible,
  ratingWeight,
  ratingsNeeded,
  thresholdsFor,
  trustFor,
} from "@/server/services/ranking.service";

const NOW = new Date("2026-10-25T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("ranking math (docs/04)", () => {
  it("a rating's weight halves at 180 days and quarters at 360, scaled by trust", () => {
    expect(ratingWeight(1, 0)).toBe(1);
    expect(ratingWeight(1, 180)).toBeCloseTo(0.5, 12);
    expect(ratingWeight(1, 360)).toBeCloseTo(0.25, 12);
    expect(ratingWeight(0.6, 180)).toBeCloseTo(0.3, 12);
    expect(ratingWeight(1.3, -5)).toBe(1.3); // a clock skew never makes a rating heavier
  });

  it("the Bayesian score leans on the prior with few votes and on the mean with many", () => {
    expect(bayesScore(0.6, 10, 6.5)).toBeCloseTo((0.6 * 10 + 8 * 6.5) / 8.6, 12);
    expect(bayesScore(0.6, 10, 6.5)).toBeLessThan(7);
    expect(bayesScore(1000, 9, 6.5)).toBeGreaterThan(8.97);
    // docs/04 worked example: A (W 10.8, R 9.1) 8.29 ranks above C (W 28, R 8.0) 7.82 with C = 7.2.
    expect(bayesScore(10.8, 9.1, 7.2)).toBeCloseTo(8.29, 2);
    expect(bayesScore(28, 8.0, 7.2)).toBeCloseTo(7.82, 2);
  });

  it("the city prior falls back to 6.5 until the city-dish mean rests on 50 ratings", () => {
    expect(cityPrior(null)).toBe(6.5);
    expect(cityPrior({ meanScore: 7.9, ratingCount: 49 })).toBe(6.5);
    expect(cityPrior({ meanScore: 7.9, ratingCount: 50 })).toBe(7.9);
  });

  it("bootstrap thresholds apply before launch and for 60 days after it", () => {
    expect(thresholdsFor(null, NOW)).toEqual({ mode: "bootstrap", minRaters: 4, minWeight: 2.5 });
    expect(thresholdsFor(daysAgo(59), NOW).mode).toBe("bootstrap");
    expect(thresholdsFor(daysAgo(61), NOW)).toEqual({ mode: "normal", minRaters: 8, minWeight: 5 });
  });

  it("eligibility needs a confirmed status, enough raters and weight, a score and an active restaurant", () => {
    const t = thresholdsFor(daysAgo(90), NOW);
    const row = { status: "USER_CONFIRMED", distinctRaters: 8, weightSum: 5, score: 7.5 };
    expect(isEligible(row, true, t)).toBe(true);
    expect(isEligible({ ...row, status: "CANDIDATE" }, true, t)).toBe(false);
    expect(isEligible({ ...row, status: "STALE" }, true, t)).toBe(false);
    expect(isEligible({ ...row, distinctRaters: 7 }, true, t)).toBe(false);
    expect(isEligible({ ...row, weightSum: 4.99 }, true, t)).toBe(false);
    expect(isEligible({ ...row, score: null }, true, t)).toBe(false);
    expect(isEligible(row, false, t)).toBe(false);
    // Bootstrap: 4 raters and W 2.5 are enough.
    expect(
      isEligible({ ...row, distinctRaters: 4, weightSum: 2.5 }, true, thresholdsFor(null, NOW)),
    ).toBe(true);
    expect(RANKING.eligibleStatuses).toEqual(["USER_CONFIRMED", "MENU_VERIFIED", "OWNER_VERIFIED"]);
  });

  it("counts the ratings still needed: missing raters, or missing weight in fresh 0.6 ratings", () => {
    const normal = thresholdsFor(daysAgo(90), NOW);
    expect(ratingsNeeded({ distinctRaters: 3, weightSum: 1.8 }, normal)).toBe(6); // weight: (5-1.8)/0.6 → 6
    expect(ratingsNeeded({ distinctRaters: 8, weightSum: 4.8 }, normal)).toBe(1);
    expect(ratingsNeeded({ distinctRaters: 8, weightSum: 4.4 }, normal)).toBe(1);
    expect(ratingsNeeded({ distinctRaters: 9, weightSum: 6 }, normal)).toBe(0);
    expect(ratingsNeeded({ distinctRaters: 1, weightSum: 1.3 }, thresholdsFor(null, NOW))).toBe(3);
  });

  it("aggregates counted ratings: W, the weighted mean and the last rating time", () => {
    const agg = aggregateRatings(
      [
        { userId: "a", score: 10, updatedAt: daysAgo(0), trust: 1 },
        { userId: "b", score: 4, updatedAt: daysAgo(180), trust: 1 },
      ],
      NOW,
    );
    expect(agg.weightSum).toBeCloseTo(1.5, 12);
    expect(agg.rawMean).toBeCloseTo((10 + 0.5 * 4) / 1.5, 12);
    expect(agg).toMatchObject({ ratingCount: 2, distinctRaters: 2, lastRatedAt: daysAgo(0) });
    expect(aggregateRatings([], NOW)).toMatchObject({
      ratingCount: 0,
      rawMean: null,
      lastRatedAt: null,
    });
  });

  it("trust follows the docs/04 table: panel first, then the 2-hidden penalty, then 1.2, 1.0, 0.6", () => {
    const base = {
      isPanel: false,
      activeRatings: 0,
      activePhotoRatings: 0,
      hiddenRatings: 0,
      upheldFlags: 0,
    };
    expect(trustFor(base)).toBe(0.6);
    expect(trustFor({ ...base, activeRatings: 3, activePhotoRatings: 1 })).toBe(1.0);
    expect(trustFor({ ...base, activeRatings: 3, activePhotoRatings: 0 })).toBe(0.6);
    expect(trustFor({ ...base, activeRatings: 20, activePhotoRatings: 6 })).toBe(1.2);
    expect(trustFor({ ...base, activeRatings: 20, activePhotoRatings: 5 })).toBe(1.0); // 25% < 30%
    expect(trustFor({ ...base, activeRatings: 20, activePhotoRatings: 6, upheldFlags: 1 })).toBe(
      1.0,
    );
    expect(trustFor({ ...base, activeRatings: 40, activePhotoRatings: 40, hiddenRatings: 2 })).toBe(
      0.3,
    );
    expect(trustFor({ ...base, isPanel: true, hiddenRatings: 5 })).toBe(1.3);
  });
});
