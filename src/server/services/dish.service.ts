// Public dish and city lists (docs/06 GET /api/v1/dishes, GET /api/v1/cities) for the rate flow.
import { AppError } from "@/server/errors";
import { findCityWithAreasBySlug, listCitiesWithAreas } from "@/server/repositories/geo.repo";
import { searchDishes } from "@/server/repositories/taxonomy.repo";
import type { DishSearchQuery } from "@/server/validation";
import { cleanText } from "./matching/normalize";

export const DISH_SEARCH_LIMIT = 20;

/** Dishes for a picker or search; `q` is matched against every spelling (docs/05). */
export async function listDishes(query: DishSearchQuery) {
  const city = query.city ? await findCityWithAreasBySlug(query.city) : null;
  if (query.city && !city) throw new AppError("CITY_NOT_FOUND", "Unknown city", 404);
  const text = query.q ? cleanText(query.q) : undefined;
  if (query.q && !text) return [];
  const rows = await searchDishes({
    text,
    cityId: city?.id,
    launchOnly: query.launchOnly,
    limit: text ? DISH_SEARCH_LIMIT : 200,
  });
  return rows.map(({ id, slug, name, category, isLaunch, eligibleCount }) => ({
    id,
    slug,
    name,
    category,
    isLaunch,
    eligibleCount,
  }));
}

export async function listCities() {
  const cities = await listCitiesWithAreas();
  return cities.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    areas: c.areas.map((a) => ({ id: a.id, slug: a.slug, name: a.name })),
  }));
}
