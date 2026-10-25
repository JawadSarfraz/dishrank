// What /rate needs on its first render (docs/01 D4, D5): the cities and their areas, the launch
// dishes, and — when the URL names them — the restaurant, the dish and the user's own rating, so a
// deep link, a sign-in return or an edit from /me opens at the right step.
import { findRater } from "@/server/repositories/user.repo";
import { findDishBySlug, listLaunchDishes } from "@/server/repositories/taxonomy.repo";
import type { SessionUser } from "@/server/roles";
import { photoUploadsEnabled } from "@/server/storage";
import { listCities } from "./dish.service";
import { findMyRating } from "./rating.service";
import { getPublicRestaurant } from "./restaurant.service";

export type RateRestaurant = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  citySlug: string;
  dishes: {
    id: string;
    slug: string;
    name: string;
    votes: number;
    score: number | null;
    rank: number | null;
  }[];
};

export async function getRatePageData(
  user: SessionUser | null,
  params: { city?: string; r?: string; d?: string },
) {
  const [cities, launchDishes, rater] = await Promise.all([
    listCities(),
    listLaunchDishes(),
    user ? findRater(user.id) : null,
  ]);
  let restaurant: RateRestaurant | null = null;
  if (params.r) {
    let found = await getPublicRestaurant(params.r);
    if (found.kind === "redirect") found = await getPublicRestaurant(found.slug);
    if (found.kind === "found") {
      restaurant = {
        id: found.restaurant.id,
        slug: found.restaurant.slug,
        name: found.restaurant.name,
        area: found.restaurant.area?.name ?? null,
        citySlug: found.restaurant.city.slug,
        dishes: found.dishes.map((d) => ({
          id: d.dish.id,
          slug: d.dish.slug,
          name: d.dish.name,
          votes: d.votes,
          score: d.score,
          rank: d.rankInCity,
        })),
      };
    }
  }
  const dish = restaurant && params.d ? await findDishBySlug(params.d) : null;
  const existing =
    user && restaurant && dish ? await findMyRating(user, restaurant.id, dish.id) : null;
  const citySlug =
    restaurant?.citySlug ??
    cities.find((c) => c.slug === params.city)?.slug ??
    cities[0]?.slug ??
    "";
  return {
    signedIn: Boolean(user),
    isPanel: Boolean(rater?.isPanel && !rater.bannedAt),
    photosEnabled: photoUploadsEnabled(),
    cities,
    citySlug,
    launchDishes: launchDishes.map(({ id, slug, name }) => ({ id, slug, name })),
    restaurant,
    dish: dish ? { id: dish.id, slug: dish.slug, name: dish.name } : null,
    existing,
  };
}

export type RatePageData = Awaited<ReturnType<typeof getRatePageData>>;
