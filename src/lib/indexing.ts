// Which public pages search engines may index (docs/01 D1c, 2026-11-11): a page is worth a result
// once it says something of our own. Thin pages are `noindex, follow` (still linked and crawled)
// and out of the sitemap; `listIndexablePages` applies the same two numbers.
export const INDEX_RULES = {
  /** A dish page: this many restaurants ranked on it (one, until 2026-11-11). */
  dishPageMinRanked: 3,
  /** A restaurant page: this many of its dishes ranked in the city (until 2026-11-11: one counted rating). */
  restaurantPageMinRankedDishes: 1,
} as const;

export const dishPageIndexable = (rankedRestaurants: number) =>
  rankedRestaurants >= INDEX_RULES.dishPageMinRanked;

export const restaurantPageIndexable = (rankedDishes: number) =>
  rankedDishes >= INDEX_RULES.restaurantPageMinRankedDishes;
