// The home page and /[city] (docs/01 screens): the launch dishes of a city with how many
// restaurants rank for each, and the one ranked first. ISR pages; nothing here depends on a user.
import { listCitiesWithAreas, listFeaturedDishes } from "@/server/repositories/geo.repo";
import {
  findCityBySlug,
  listCityDishSummaries,
  listIndexablePages,
} from "@/server/repositories/public.repo";
import { listLaunchDishes } from "@/server/repositories/taxonomy.repo";
import { votingClosesLine } from "./featured";
import { thresholdsFor } from "./ranking.service";

export type CityDish = {
  slug: string;
  name: string;
  /** Restaurants ranked for this dish in the city. */
  ranked: number;
  /** Places on this dish's list in the city (docs/01 D2a): ranked, collecting votes, or checked. */
  contenders: number;
  top: { slug: string; name: string; score: number; votes: number } | null;
};

/** One city's launch-dish grid, with the city picker's cities. Null for an unknown city. */
export async function getCityOverview(citySlug: string, now: Date = new Date()) {
  const city = await findCityBySlug(citySlug);
  if (!city) return null;
  const cities = await listCitiesWithAreas();
  const dishes = await listLaunchDishes();
  const { counts, tops, contenders } = await listCityDishSummaries(city.id);
  const featuredRows = await listFeaturedDishes(city.id);
  const ranked = new Map(counts.map((c) => [c.dishId, c._count._all]));
  const listed = new Map(contenders.map((c) => [c.dishId, c._count._all]));
  const top = new Map(tops.map((t) => [t.dishId, t]));
  // The live thresholds: the pages' trust text reads the rater count from here, never a constant.
  const thresholds = thresholdsFor(city.launchedAt, now);
  const all = dishes.map((d): CityDish => {
    const first = top.get(d.id);
    return {
      slug: d.slug,
      name: d.name,
      ranked: ranked.get(d.id) ?? 0,
      contenders: listed.get(d.id) ?? 0,
      top: first
        ? {
            slug: first.restaurant.slug,
            name: first.restaurant.name,
            score: Number(first.score),
            votes: first.distinctRaters,
          }
        : null,
    };
  });
  // The featured round (docs/01 Home): the page leads with these; the rest split into dishes
  // with a list and dishes still waiting for their contenders.
  const bySlug = new Map(all.map((d) => [d.slug, d]));
  const featured = featuredRows.flatMap((f) => bySlug.get(f.dish.slug) ?? []);
  const featuredSlugs = new Set(featured.map((d) => d.slug));
  const rest = all.filter((d) => !featuredSlugs.has(d.slug));
  return {
    city: { slug: city.slug, name: city.name },
    cities: cities.map((c) => ({ slug: c.slug, name: c.name })),
    mode: thresholds.mode,
    minRaters: thresholds.minRaters,
    /** Every launch dish, in seed order. */
    dishes: all,
    featured: {
      dishes: featured,
      closesAt: city.featuredClosesAt,
      roundName: city.featuredRound,
      closingLine: votingClosesLine(city.featuredClosesAt, city.featuredRound, now),
    },
    /** Not featured, with at least one contender: the smaller grid. */
    open: rest.filter((d) => d.ranked > 0 || d.contenders > 0),
    /** Nothing listed yet: "Coming next", asking for nominations. */
    comingNext: rest.filter((d) => d.ranked === 0 && d.contenders === 0),
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
