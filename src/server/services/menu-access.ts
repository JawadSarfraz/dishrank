// Who may upload a menu photo for a restaurant (docs/07 §3): admins, panel members and the owner
// who claimed it; never a banned account, and only for an ACTIVE restaurant. Read from the
// database on every call, never from the client.
// Decided 2026-11-04: "owners" = the user who claimed this restaurant (claimedByUserId), not every
// account with role OWNER; a panel member may upload for any restaurant.
import { AppError } from "@/server/errors";
import { findRestaurantById } from "@/server/repositories/restaurant.repo";
import { findRater } from "@/server/repositories/user.repo";
import type { SessionUser } from "@/server/roles";

export type MenuUploader = "admin" | "panel" | "owner";

/** Why this user may upload menus here, or null when they may not (also for unknown ids). */
export async function menuUploaderRole(
  user: SessionUser,
  restaurantId: string,
): Promise<MenuUploader | null> {
  const [rater, restaurant] = await Promise.all([
    findRater(user.id),
    findRestaurantById(restaurantId),
  ]);
  if (!rater || rater.bannedAt || !restaurant || restaurant.status !== "ACTIVE") return null;
  if (user.role === "ADMIN") return "admin";
  if (rater.isPanel) return "panel";
  if (restaurant.claimedByUserId === user.id) return "owner";
  return null;
}

/** The same rule as menuUploaderRole, as errors: NOT_FOUND, RESTAURANT_INACTIVE, USER_BANNED, 403. */
export async function assertMenuUploader(user: SessionUser, restaurantId: string) {
  const restaurant = await findRestaurantById(restaurantId);
  if (!restaurant || restaurant.status === "DUPLICATE") {
    throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  }
  if (restaurant.status !== "ACTIVE") {
    throw new AppError("RESTAURANT_INACTIVE", "This restaurant is not open on DishRank", 409);
  }
  const rater = await findRater(user.id);
  if (!rater || rater.bannedAt)
    throw new AppError("USER_BANNED", "This account cannot upload", 403);
  const role = await menuUploaderRole(user, restaurantId);
  if (!role) {
    throw new AppError(
      "MENU_UPLOAD_NOT_ALLOWED",
      "Only panel members, the restaurant's owner and admins can upload menu photos",
      403,
    );
  }
  return { role, restaurant };
}
