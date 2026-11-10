// What /rate needs on its first render (docs/01 D4, D5): the cities and their areas, the launch
// dishes, and — when the URL names them — the restaurant, the dish, the user's own rating and a
// score tapped before sign-in, so a deep link, a sign-in return or an edit from /me opens at the
// right step.
import { parsePendingScore } from "@/lib/pending-score";
import { seededOrder } from "@/lib/shuffle";
import { AppError } from "@/server/errors";
import { findCityBySlug, listRankingRows } from "@/server/repositories/public.repo";
import { listRatingsOfUserForDish } from "@/server/repositories/rating.repo";
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
  params: { city?: string; r?: string; d?: string; score?: string; suggest?: string },
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
    /** The score tapped before signing in: it fills the score step, and the diner submits it. */
    pendingScore: restaurant && dish ? parsePendingScore(params.score) : null,
    /** "Missing one? Add it" on a dish page opens the suggest-a-restaurant form. */
    suggestOpen: params.suggest === "1",
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
 * the ranked ones first, with the user's own ratings. Open to anyone, since the list is public: a
 * signed-out diner's tap goes to the score step (QuickRatePanel) and signs in there. Every score
 * then goes through RatingService.
 */
export async function getQuickRatePlaces(
  actor: SessionUser | null,
  input: { city: string; dish: string; seed?: string },
) {
  const [city, dish] = await Promise.all([findCityBySlug(input.city), findDishBySlug(input.dish)]);
  if (!city || !dish) throw new AppError("NOT_FOUND", "City or dish not found", 404);
  const [rows, mine] = await Promise.all([
    listRankingRows(city.id, dish.id, 400),
    actor ? listRatingsOfUserForDish(actor.id, city.id, dish.id) : [],
  ]);
  const mineAt = new Map(mine.map((r) => [r.restaurantDish.restaurantId, r]));
  // The dish page's order: ranked, then collecting votes, then the contenders nobody has rated in
  // the page's shuffled order (its seed comes along), or by name without one.
  const voted = rows.filter((r) => r.rankInCity !== null || r.distinctRaters > 0);
  const fresh = rows.filter((r) => r.rankInCity === null && r.distinctRaters === 0);
  const ordered = [...voted, ...(input.seed ? seededOrder(fresh, input.seed, (r) => r.id) : fresh)];
  return {
    signedIn: Boolean(actor),
    city: { slug: city.slug, name: city.name },
    dish: { id: dish.id, slug: dish.slug, name: dish.name },
    /** Every rating of this dish here: a place found by search may be off the list below. */
    mine: mine.map((r) => ({
      restaurantId: r.restaurantDish.restaurantId,
      score: r.score,
      status: r.status,
    })),
    places: ordered.map((row): QuickRatePlace => {
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
