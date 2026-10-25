// /admin/users (docs/09 Prompt 4 item 10, docs/06 PATCH /api/v1/admin/users/:id): find users and
// turn the panel flag on or off. The flag is set only here, by an admin; turning it on fixes trust
// at 1.3, turning it off returns the user to the docs/04 trust table at once (the nightly job
// arrives in Phase 4). Trust is read at compute time, so the user's dish rows are recomputed.
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import {
  findTrustStats,
  listRatedRowsOfUser,
  listUsersPage,
  updateUserById,
} from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import type { AdminUserListQuery } from "@/server/validation";
import { TRUST } from "./ranking.constants";
import { recomputeOne, trustFor } from "./ranking.service";

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

/** Recomputes a user's trust from the docs/04 table and every row their ratings count in. */
export async function refreshUserTrust(userId: string) {
  const stats = await findTrustStats(userId);
  if (!stats) return null;
  const trustScore = trustFor(stats);
  const updated = await updateUserById(userId, { trustScore });
  for (const rowId of await listRatedRowsOfUser(userId)) await recomputeOne(rowId);
  return updated;
}

export async function setPanel(actor: SessionUser | null, userId: string, isPanel: boolean) {
  const admin = assertRole(actor, "ADMIN");
  const stats = await findTrustStats(userId);
  if (!stats) throw new AppError("NOT_FOUND", "User not found", 404);
  // Panel trust is fixed at 1.3 (Decided 2026-10-22); off → the trust table (docs/04).
  const trustScore = isPanel ? TRUST.panel : trustFor({ ...stats, isPanel: false });
  const updated = await updateUserById(userId, { isPanel, trustScore });
  const rows = await listRatedRowsOfUser(userId);
  for (const rowId of rows) await recomputeOne(rowId);
  logEvent("admin.user.panel", {
    userId: admin.id,
    entityId: userId,
    isPanel,
    trustScore,
    recomputedRows: rows.length,
  });
  return { ...updated, recomputedRows: rows.length };
}
