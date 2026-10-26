// The home page and /[city] (docs/01 screens): the launch dishes of a city with how many
// restaurants rank for each, and the one ranked first. ISR pages; nothing here depends on a user.
import { listCitiesWithAreas } from "@/server/repositories/geo.repo";
import {
  findCityBySlug,
  listCityDishSummaries,
  listIndexablePages,
} from "@/server/repositories/public.repo";
import { listLaunchDishes } from "@/server/repositories/taxonomy.repo";
import { thresholdsFor } from "./ranking.service";

export type CityDish = {
  slug: string;
  name: string;
  /** Restaurants ranked for this dish in the city. */
  ranked: number;
  top: { slug: string; name: string; score: number; votes: number } | null;
};

/** One city's launch-dish grid, with the city picker's cities. Null for an unknown city. */
export async function getCityOverview(citySlug: string, now: Date = new Date()) {
  const city = await findCityBySlug(citySlug);
  if (!city) return null;
  const cities = await listCitiesWithAreas();
  const dishes = await listLaunchDishes();
  const { counts, tops } = await listCityDishSummaries(city.id);
  const ranked = new Map(counts.map((c) => [c.dishId, c._count._all]));
  const top = new Map(tops.map((t) => [t.dishId, t]));
  return {
    city: { slug: city.slug, name: city.name },
    cities: cities.map((c) => ({ slug: c.slug, name: c.name })),
    mode: thresholdsFor(city.launchedAt, now).mode,
    dishes: dishes.map((d): CityDish => {
      const first = top.get(d.id);
      return {
        slug: d.slug,
        name: d.name,
        ranked: ranked.get(d.id) ?? 0,
        top: first
          ? {
              slug: first.restaurant.slug,
              name: first.restaurant.name,
              score: Number(first.score),
              votes: first.distinctRaters,
            }
          : null,
      };
    }),
  };
}

export type CityOverview = NonNullable<Awaited<ReturnType<typeof getCityOverview>>>;

/** The city the home page shows first: the first by name (Islamabad). */
export async function defaultCitySlug() {
  const [first] = await listCitiesWithAreas();
  return first?.slug ?? null;
}

/** sitemap.ts: the home page, each city, and the indexable ranking and restaurant pages. */
export async function listSitemapEntries(): Promise<{ path: string; lastModified?: Date }[]> {
  const pages = await listIndexablePages();
  const at = (d: Date | null) => (d ? { lastModified: d } : {});
  return [
    { path: "/" },
    ...pages.cities.map((city) => ({ path: `/${city}` })),
    ...pages.lists.map((l) => ({
      path: `/${l.citySlug}/best-${l.dishSlug}`,
      ...at(l.lastRatedAt),
    })),
    ...pages.restaurants.map((r) => ({ path: `/${r.citySlug}/r/${r.slug}`, ...at(r.lastRatedAt) })),
    ...["/how-rankings-work", "/about", "/about/data", "/dispute"].map((path) => ({ path })),
  ];
}
