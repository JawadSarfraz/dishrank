// "Delete my account" on /me (Phase 6, owner 2026-11-04): the user's ratings (then their dish rows
// are recomputed), photos, sessions and account go; what stays without their name is listed in
// deleteAccountTx (account.repo.ts) and on /privacy. A banned account deletes itself like any
// other; its e-mail hash stays on the ban list (audit 2026-11, A-01).
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { deleteAccountTx, listRatingsForDeletion } from "@/server/repositories/account.repo";
import { listDishGroupsOfRows, lockCityDishLists } from "@/server/repositories/ranking.repo";
import {
  listDishPagesOfRows,
  lockRestaurantDishes,
} from "@/server/repositories/restaurant-dish.repo";
import { inTransaction } from "@/server/repositories/transaction";
import { listUploadsOfUser } from "@/server/repositories/upload.repo";
import { lockUser } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import { getStorage, type StorageAdapter } from "@/server/storage";
import type { AccountDeleteInput } from "@/server/validation";
import { recomputeEach } from "./ranking.service";
import { deleteUnfiledMenuUploads, deleteUnusedPhotos } from "./upload.service";

/**
 * Deletes the signed-in user's account. The dish rows of their ratings are locked first (their
 * (city, dish) lists, then the rows, then the user: the order the ban decision uses), so a rating
 * saved meanwhile is either deleted too or refused afterwards (its user is gone). After commit the
 * rows are recomputed and the photo files deleted. An admin cannot delete their own account here.
 */
export async function deleteMyAccount(
  actor: SessionUser | null,
  input: AccountDeleteInput,
  storage: StorageAdapter | null = getStorage(),
  now: Date = new Date(),
) {
  const user = assertRole(actor, ["USER", "OWNER", "ADMIN"]);
  if (input.confirm !== "DELETE") {
    throw new AppError("VALIDATION_FAILED", "Type DELETE to confirm", 400);
  }
  if (user.role === "ADMIN") {
    // DECISION-PENDING: so the site never loses its last admin, an admin is removed by hand.
    throw new AppError(
      "ADMIN_ACCOUNT",
      "An admin account cannot delete itself. Ask another admin, or remove the role first.",
      409,
    );
  }
  await assertRateLimit(`user:${user.id}:account-delete`, RATE_LIMITS.accountDelete, now);
  const uploads = await listUploadsOfUser(user.id);
  // Menu photos signed but never filed would lose their row with the account and stay in the
  // private bucket for good (audit 2026-11, A-12): their files go first.
  const unfiledMenus = await deleteUnfiledMenuUploads(user.id, storage);
  const result = await inTransaction(async (tx) => {
    const before = await listRatingsForDeletion(user.id, tx);
    const rows = [...new Set(before.map((r) => r.restaurantDishId))];
    await lockCityDishLists(await listDishGroupsOfRows(rows, tx), tx);
    await lockRestaurantDishes(rows, tx);
    await lockUser(user.id, tx);
    // A rating saved since the list above is on a row this transaction may not hold: try again.
    const ratings = await listRatingsForDeletion(user.id, tx);
    if (ratings.some((r) => !rows.includes(r.restaurantDishId))) {
      throw new AppError("CONFLICT", "Something changed at the same time. Try again.", 409);
    }
    const deleted = await deleteAccountTx(user.id, tx);
    return { ...deleted, rows, photos: ratings.map((r) => r.photoPath) };
  });

  await recomputeEach(result.rows, now);
  // Dish photos only; menu photos stay with their restaurant (the upload row has gone with the user).
  await deleteUnusedPhotos(
    [...result.photos, ...uploads.filter((u) => u.kind === "DISH_PHOTO").map((u) => u.path)],
    storage,
  );
  logEvent("account.delete", {
    entityId: user.id,
    ratings: result.ratings,
    reviewItems: result.reviewItems,
    redactedItems: result.redactedItems,
    bannedKept: result.bannedKept,
    unfiledMenus,
    rows: result.rows.length,
  });
  return { deleted: true, dishPages: await listDishPagesOfRows(result.rows) };
}
