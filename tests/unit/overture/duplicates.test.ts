import { describe, expect, it } from "vitest";
import {
  NearbyIndex,
  candidateHints,
  countDuplicatePairs,
  jaroWinkler,
  nameKey,
  restaurantHints,
  sameName,
  similarNames,
  type DedupeRestaurant,
} from "@/server/services/overture/duplicates";

const F7 = { lat: 33.7215, lng: 73.0569 };
const metresNorth = (m: number) => ({ lat: F7.lat + m / 111_200, lng: F7.lng });

describe("duplicate rule (docs/research/overture-coverage.md §4)", () => {
  it("compares names as lowercase letters and digits", () => {
    expect(nameKey("Mc Donald's, F-10")).toBe("mcdonaldsf10");
    expect(nameKey("  کراچی  ")).toBe("کراچی"); // Urdu-only names stay comparable
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 3);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });

  it("similar = equal, Jaro-Winkler ≥ 0.9, or one contains the other (both ≥ 4 letters)", () => {
    expect(similarNames("KFC", "K.F.C.")).toBe(true); // equal keys, any length
    expect(similarNames("Mc Donalds, F-10, Islamabad", "McDonald's")).toBe(true); // contains
    expect(similarNames("MeiKong Chinese Restaurant", "Mei Kong")).toBe(true);
    expect(similarNames("Savour Foods", "Savor Foods")).toBe(true); // Jaro-Winkler
    expect(similarNames("KFC", "KFC G-9")).toBe(false); // too short to contain
    expect(similarNames("Fixture Karahi", "Fixture Bakers")).toBe(false);
    // Without a distance only equal names or Jaro-Winkler count: "Cafe" is not every café.
    expect(sameName("Fixture Cafe", "Cafe")).toBe(false);
    expect(similarNames("Fixture Cafe", "Cafe")).toBe(true);
    expect(sameName("Butt Karahi", "Butt Karahi Tikka")).toBe(true);
  });

  it("finds our restaurants within 50 m with a similar name or other name, else the same name in the area", () => {
    const restaurant = (over: Partial<DedupeRestaurant>): DedupeRestaurant => ({
      id: "r",
      slug: "r",
      name: "Fixture",
      aliases: [],
      lat: null,
      lng: null,
      areaId: "area-f7",
      areaName: "F-7",
      status: "ACTIVE",
      ...over,
    });
    const restaurants = [
      restaurant({ id: "near", name: "Fixture Karahi House", ...metresNorth(30) }),
      restaurant({
        id: "alias",
        name: "Old Name",
        aliases: ["Fixture Karahi"],
        ...metresNorth(10),
      }),
      restaurant({ id: "far", name: "Fixture Karahi", ...metresNorth(80) }),
      restaurant({ id: "unlocated", name: "Fixture Karahi" }),
      restaurant({ id: "other-area", name: "Fixture Karahi", areaId: "area-g9" }),
      restaurant({ id: "other-name", name: "Fixture Bakers", ...metresNorth(5) }),
    ];
    const index = new NearbyIndex(
      restaurants.flatMap((r) =>
        r.lat !== null && r.lng !== null ? [{ ...r, lat: r.lat, lng: r.lng }] : [],
      ),
    );
    const located = { id: "c1", name: "Fixture Karahi", ...F7, suggestedAreaId: "area-f7" };
    expect(restaurantHints(located, restaurants, index).map((h) => [h.id, h.metres])).toEqual([
      ["alias", 10],
      ["near", 30],
      ["unlocated", null],
    ]);
    // Location unknown: same name in the city (no suggested area), never a distance.
    const unknown = {
      id: "c2",
      name: "Fixture Karahi",
      lat: null,
      lng: null,
      suggestedAreaId: null,
    };
    expect(restaurantHints(unknown, restaurants, index).map((h) => [h.id, h.metres])).toEqual([
      ["far", null],
      ["unlocated", null],
      ["other-area", null],
    ]);
  });

  it("finds other candidates within 50 m and counts duplicate pairs once", () => {
    const candidates = [
      { id: "a", name: "KFC", ...F7, suggestedAreaId: null },
      { id: "b", name: "KFC", ...metresNorth(30), suggestedAreaId: null },
      { id: "c", name: "KFC", ...metresNorth(120), suggestedAreaId: null },
      { id: "d", name: "Fixture Chai", ...metresNorth(5), suggestedAreaId: null },
      { id: "e", name: "KFC", lat: null, lng: null, suggestedAreaId: null },
    ];
    const index = new NearbyIndex(
      candidates.flatMap((c) =>
        c.lat !== null && c.lng !== null ? [{ ...c, lat: c.lat, lng: c.lng }] : [],
      ),
    );
    expect(candidateHints(candidates[0], index).map((h) => [h.point.id, h.metres])).toEqual([
      ["b", 30],
    ]);
    expect(candidateHints(candidates[4], index)).toEqual([]);
    expect(countDuplicatePairs(candidates)).toBe(1);
  });
});
