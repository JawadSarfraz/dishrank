// The index rules (docs/01 D1c): too loose and thin pages reach search results; too strict and the
// sitemap goes empty. The sitemap query and the pages' robots tags share these two functions.
import { describe, expect, it } from "vitest";
import { INDEX_RULES, dishPageIndexable, restaurantPageIndexable } from "@/lib/indexing";

describe("index rules", () => {
  it("a dish page needs three ranked restaurants; a restaurant page one ranked dish", () => {
    expect(INDEX_RULES).toEqual({ dishPageMinRanked: 3, restaurantPageMinRankedDishes: 1 });
    expect([0, 1, 2].map(dishPageIndexable)).toEqual([false, false, false]);
    expect([3, 4, 50].map(dishPageIndexable)).toEqual([true, true, true]);
    expect(restaurantPageIndexable(0)).toBe(false);
    expect(restaurantPageIndexable(1)).toBe(true);
  });
});
