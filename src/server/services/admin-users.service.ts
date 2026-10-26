// /admin/users (docs/09 Prompt 4 item 10, docs/06 PATCH /api/v1/admin/users/:id): find users, turn
// the panel flag on or off, and set a user's trust by hand. Both are set only here, by an admin:
// panel on gives trust 1.3, an override gives its own value (kept by the nightly job), and turning
// either off returns the user to the docs/04 trust table at once. Trust is read at compute time, so
// the user's dish rows are recomputed.
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { listDishPagesOfRows } from "@/server/repositories/restaurant-dish.repo";
import { inTransaction } from "@/server/repositories/transaction";
import {
  findTrustStats,
  listRatedRowsOfUser,
  listUsersPage,
  lockUser,
  updateUserById,
} from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import type { AdminUserListQuery } from "@/server/validation";
import { recomputeEach, trustFor } from "./ranking.service";

export const USERS_PAGE_SIZE = 25;

export async function listUsersForAdmin(actor: SessionUser | null, query: AdminUserListQuery) {
  assertRole(actor, "ADMIN");
  const { items, total } = await listUsersPage({
    q: query.q,
    panelOnly: query.panel === "only",
    skip: (query.page - 1) * USERS_PAGE_SIZE,
    take: USERS_PAGE_SIZE,
  });
  return {
    items,
    total,
    page: query.page,
    pages: Math.max(1, Math.ceil(total / USERS_PAGE_SIZE)),
  };
}

/**
 * Recomputes a user's trust from the docs/04 table, then every row their ratings count in, and
 * returns those rows (their pages show new scores). Read and written under the user's row lock, so
 * a panel toggle at the same moment is either seen here or waits.
 */
export async function refreshUserTrust(userId: string) {
  const updated = await inTransaction(async (tx) => {
    await lockUser(userId, tx);
    const stats = await findTrustStats(userId, tx);
    return stats ? updateUserById(userId, { trustScore: trustFor(stats) }, tx) : null;
  });
  if (!updated) return null;
  const rows = await listRatedRowsOfUser(userId);
  await recomputeEach(rows); // trust is saved; a row that fails is logged
  return { user: updated, rows };
}

export async function setPanel(actor: SessionUser | null, userId: string, isPanel: boolean) {
  const admin = assertRole(actor, "ADMIN");
  // Under the user's row lock, like refreshUserTrust: the two never overwrite each other.
  const updated = await inTransaction(async (tx) => {
    await lockUser(userId, tx);
    const stats = await findTrustStats(userId, tx);
    if (!stats) throw new AppError("NOT_FOUND", "User not found", 404);
    // Panel trust is 1.3 (Decided 2026-10-22) unless an admin set an override; off → the table.
    const trustScore = trustFor({ ...stats, isPanel });
    return updateUserById(userId, { isPanel, trustScore }, tx);
  });
  const trustScore = updated.trustScore;
  const rows = await listRatedRowsOfUser(userId);
  await recomputeEach(rows);
  logEvent("admin.user.panel", {
    userId: admin.id,
    entityId: userId,
    isPanel,
    trustScore,
    recomputedRows: rows.length,
  });
  // The public pages of those rows, for the caller to revalidate.
  return { ...updated, recomputedRows: rows.length, dishPages: await listDishPagesOfRows(rows) };
}

/**
 * An admin sets a user's trust by hand (0.3 to 1.5), or clears it (null) to return them to the
 * docs/04 table. It is stored apart from trustScore, so the nightly trust step keeps it.
 */
export async function setTrustOverride(
  actor: SessionUser | null,
  userId: string,
  trustOverride: number | null,
) {
  const admin = assertRole(actor, "ADMIN");
  // Under the user's row lock, like the panel toggle and the nightly trust step.
  const updated = await inTransaction(async (tx) => {
    await lockUser(userId, tx);
    const stats = await findTrustStats(userId, tx);
    if (!stats) throw new AppError("NOT_FOUND", "User not found", 404);
    const trustScore = trustFor({ ...stats, trustOverride });
    return updateUserById(userId, { trustOverride, trustScore }, tx);
  });
  const rows = await listRatedRowsOfUser(userId);
  await recomputeEach(rows);
  logEvent("admin.user.trust", {
    userId: admin.id,
    entityId: userId,
    trustOverride,
    trustScore: updated.trustScore,
    recomputedRows: rows.length,
  });
  return { ...updated, recomputedRows: rows.length, dishPages: await listDishPagesOfRows(rows) };
}
