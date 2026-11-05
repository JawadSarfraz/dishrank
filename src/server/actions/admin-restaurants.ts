"use server";
// /admin/restaurants actions: auth → rate limit → validate → service → revalidate.
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/server/auth";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { revalidateDishPages } from "@/server/revalidate";
import { removeRestaurantOwner } from "@/server/services/claim.service";
import {
  createRestaurant,
  mergeRestaurants,
  searchRestaurantsForAdmin,
  setRestaurantStatus,
  updateRestaurant,
} from "@/server/services/restaurant.service";
import {
  adminRestaurantInput,
  adminRestaurantUpdateInput,
  ownerRemoveInput,
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

/** /admin/restaurants/new: a restaurant added by hand (source MANUAL). */
export async function createRestaurantAction(input: unknown) {
  return runAction("restaurant.create", async () => {
    const actor = await adminWriter();
    const { restaurant } = await createRestaurant(actor, parseInput(adminRestaurantInput, input));
    return { restaurant };
  });
}

export async function updateRestaurantAction(restaurantId: unknown, input: unknown) {
  return runAction("restaurant.update", async () => {
    const actor = await adminWriter();
    const result = await updateRestaurant(
      actor,
      parseInput(id, restaurantId),
      parseInput(adminRestaurantUpdateInput, input),
    );
    revalidatePath(restaurantPage(result.citySlug, result.slug));
    // A new name, area or location shows on every ranking page of its dishes, the city page and home.
    for (const page of result.dishPages) revalidateDishPages(page);
    refresh();
    return { id: result.id, slug: result.slug, citySlug: result.citySlug };
  });
}

export async function setRestaurantStatusAction(restaurantId: unknown, input: unknown) {
  return runAction("restaurant.status", async () => {
    const actor = await adminWriter();
    const { status } = parseInput(restaurantStatusInput, input);
    const result = await setRestaurantStatus(actor, parseInput(id, restaurantId), status);
    revalidatePath(restaurantPage(result.citySlug, result.slug));
    // A closed or hidden restaurant leaves its ranking pages at once, not at the hourly refresh.
    for (const page of result.dishPages) revalidateDishPages(page);
    refresh();
    return { id: result.id, slug: result.slug, citySlug: result.citySlug, status: result.status };
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
    // The target's dish rows (name, area, location, scores) on every page that lists them.
    for (const page of result.dishPages) revalidateDishPages(page);
    refresh();
    return {
      target: result.target,
      movedDishes: result.movedDishes.length,
      mergedDishes: result.mergedDishes.length,
      movedRatings: result.movedRatings.length,
      mergedRatings: result.mergedRatings.length,
    };
  });
}

/** "Remove owner" on /admin/restaurants: `{ ownerId, reason }`; the reason is required and logged. */
export async function removeRestaurantOwnerAction(restaurantId: unknown, input: unknown) {
  return runAction("restaurant.owner_remove", async () => {
    const actor = await adminWriter();
    const result = await removeRestaurantOwner(
      actor,
      parseInput(id, restaurantId),
      parseInput(ownerRemoveInput, input),
    );
    // The restaurant page offers "Is this your restaurant?" again, and ratings that count again
    // change scores and ranks.
    revalidatePath(restaurantPage(result.citySlug, result.slug));
    for (const page of result.dishPages) revalidateDishPages(page);
    refresh();
    return { ownerRoleRemoved: result.ownerRoleRemoved };
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
