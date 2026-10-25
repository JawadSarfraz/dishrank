// The one Text Search query per (dish, area): the live search on /admin/import and the
// pnpm seed:places planning tool build it here, so planned counts match what the admin sees.
import { boxAround } from "@/lib/geo";
import type { TextSearchParams } from "@/server/places";

/**
 * includedType only biases results (strictTypeFiltering stays false), but the bias still pushes
 * other venues down the list. Tea stalls, halwa-puri shops, sweet shops and street stalls are often
 * typed cafe, tea_house, bakery or nothing at all, so dishes in these categories search without a type.
 */
// DECISION-PENDING: which dish categories search without includedType "restaurant" (docs/OPEN-QUESTIONS.md).
export const UNTYPED_SEARCH_CATEGORIES: readonly string[] = [
  "breakfast",
  "drinks",
  "desserts",
  "street-food",
];

export function includedTypeFor(categorySlug: string): string | undefined {
  return UNTYPED_SEARCH_CATEGORIES.includes(categorySlug) ? undefined : "restaurant";
}

/**
 * locationRestriction: a rectangle reaching this far from the searched area's centre (our own seed
 * coordinates, never Google's). Places outside it, such as a Lahore branch, never come back.
 */
// DECISION-PENDING: 3 km each way (a 6 km × 6 km box) around the area centre.
export const SEARCH_BOX_HALF_SIZE_KM = 3;

export function buildPlacesSearch(input: {
  dish: { name: string; categorySlug: string };
  area: { name: string; lat: number; lng: number };
  city: { name: string };
}): TextSearchParams {
  return {
    textQuery: `${input.dish.name} ${input.area.name} ${input.city.name}`,
    includedType: includedTypeFor(input.dish.categorySlug),
    restriction: boxAround(input.area, SEARCH_BOX_HALF_SIZE_KM),
  };
}
