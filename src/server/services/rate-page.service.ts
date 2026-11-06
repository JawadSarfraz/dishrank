// What /rate needs on its first render (docs/01 D4, D5): the cities and their areas, the launch
// dishes, and — when the URL names them — the restaurant, the dish and the user's own rating, so a
// deep link, a sign-in return or an edit from /me opens at the right step.
import { AppError } from "@/server/errors";
import { findCityBySlug, listRankingRows } from "@/server/repositories/public.repo";
import { listRatingsOfUserForDish } from "@/server/repositories/rating.repo";
import { findRater } from "@/server/repositories/user.repo";
import { findDishBySlug, listLaunchDishes } from "@/server/repositories/taxonomy.repo";
import { assertRole, type SessionUser } from "@/server/roles";
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
    userName: user?.name ?? null,
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

export type QuickRatePlace = {
  restaurantId: string;
  slug: string;
  name: string;
  area: string | null;
  /** The user's own rating here, set before this list opened. */
  mine: { score: number; status: string } | null;
};

/**
 * "Rate the places you know" on a dish page (docs/01 D4a): the places of the city linked to the dish,
 * the ranked ones first, with the user's own ratings. Every score then goes through RatingService.
 */
export async function getQuickRatePlaces(
  actor: SessionUser | null,
  input: { city: string; dish: string },
) {
  const user = assertRole(actor, ["USER", "OWNER", "ADMIN"]);
  const [city, dish] = await Promise.all([findCityBySlug(input.city), findDishBySlug(input.dish)]);
  if (!city || !dish) throw new AppError("NOT_FOUND", "City or dish not found", 404);
  const [rows, mine] = await Promise.all([
    listRankingRows(city.id, dish.id, 400),
    listRatingsOfUserForDish(user.id, city.id, dish.id),
  ]);
  const mineAt = new Map(mine.map((r) => [r.restaurantDish.restaurantId, r]));
  return {
    city: { slug: city.slug, name: city.name },
    dish: { id: dish.id, slug: dish.slug, name: dish.name },
    /** Every rating of this dish here: a place found by search may be off the list below. */
    mine: mine.map((r) => ({
      restaurantId: r.restaurantDish.restaurantId,
      score: r.score,
      status: r.status,
    })),
    places: rows.map((row): QuickRatePlace => {
      const own = mineAt.get(row.restaurant.id);
      return {
        restaurantId: row.restaurant.id,
        slug: row.restaurant.slug,
        name: row.restaurant.name,
        area: row.restaurant.area?.name ?? null,
        mine: own ? { score: own.score, status: own.status } : null,
      };
    }),
  };
}

export type QuickRateData = Awaited<ReturnType<typeof getQuickRatePlaces>>;
