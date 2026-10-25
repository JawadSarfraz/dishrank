"use server";
// /admin/restaurants actions: auth → rate limit → validate → service → revalidate.
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/server/auth";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import {
  mergeRestaurants,
  searchRestaurantsForAdmin,
  setRestaurantStatus,
  updateRestaurant,
} from "@/server/services/restaurant.service";
import {
  adminRestaurantUpdateInput,
  parseInput,
  restaurantMergeInput,
  restaurantStatusInput,
} from "@/server/validation";
import { id, text } from "@/server/validation/common";
import { runAction } from "./result";

async function adminWriter() {
  const actor = await requireRole("ADMIN");
  await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
  return actor;
}

const restaurantPage = (citySlug: string, slug: string) => `/${citySlug}/r/${slug}`;

export async function updateRestaurantAction(restaurantId: unknown, input: unknown) {
  return runAction("restaurant.update", async () => {
    const actor = await adminWriter();
    const result = await updateRestaurant(
      actor,
      parseInput(id, restaurantId),
      parseInput(adminRestaurantUpdateInput, input),
    );
    revalidatePath(restaurantPage(result.citySlug, result.slug));
    refresh();
    return result;
  });
}

export async function setRestaurantStatusAction(restaurantId: unknown, input: unknown) {
  return runAction("restaurant.status", async () => {
    const actor = await adminWriter();
    const { status } = parseInput(restaurantStatusInput, input);
    const result = await setRestaurantStatus(actor, parseInput(id, restaurantId), status);
    revalidatePath(restaurantPage(result.citySlug, result.slug));
    refresh();
    return result;
  });
}

/** Merges this restaurant into `mergeIntoId` (docs/07 §2); this one becomes DUPLICATE and redirects. */
export async function mergeRestaurantAction(restaurantId: unknown, input: unknown) {
  return runAction("restaurant.merge", async () => {
    const actor = await adminWriter();
    const { mergeIntoId } = parseInput(restaurantMergeInput, input);
    const result = await mergeRestaurants(actor, parseInput(id, restaurantId), mergeIntoId);
    revalidatePath(restaurantPage(result.source.citySlug, result.source.slug));
    revalidatePath(restaurantPage(result.target.citySlug, result.target.slug));
    for (const dishSlug of result.dishSlugs) {
      revalidatePath(`/${result.target.citySlug}/best-${dishSlug}`);
    }
    refresh();
    return {
      target: result.target,
      movedDishes: result.movedDishes.length,
      mergedDishes: result.mergedDishes.length,
      movedRatings: result.movedRatings.length,
      mergedRatings: result.mergedRatings.length,
      googlePlaceMoved: result.googlePlaceMoved,
    };
  });
}

const adminSearchInput = z.object({
  cityId: id,
  q: text(80),
  excludeId: id.optional(),
});

/** Link and merge targets: restaurants of the city in any status except DUPLICATE. */
export async function searchRestaurantsAdminAction(input: unknown) {
  return runAction("restaurant.admin_search", async () => {
    const actor = await requireRole("ADMIN");
    return searchRestaurantsForAdmin(actor, parseInput(adminSearchInput, input));
  });
}
