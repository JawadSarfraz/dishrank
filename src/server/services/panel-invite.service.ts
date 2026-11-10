// Panel invite links (docs/07 §7a): an admin creates a link on /admin/users, and whoever signs in
// through it becomes a panel member (trust 1.0, exempt from the burst rule) and passes the beta
// allowlist. The token is 256 random bits and only its hash is stored, so the link is shown once.
// Revoking or expiring a link stops new joins; people who joined stay on the panel until an admin
// turns them off. Every rating they give still goes through RatingService.
import { createHash, randomBytes } from "node:crypto";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import {
  findPanelInviteByHash,
  findPanelInviteUse,
  insertPanelInvite,
  listPanelInvites as listPanelInviteRows,
  lockPanelInviteByHash,
  panelInviteExists,
  recordPanelInviteUse,
  revokePanelInviteById,
} from "@/server/repositories/panel-invite.repo";
import { listDishPagesOfRows } from "@/server/repositories/restaurant-dish.repo";
import { inTransaction } from "@/server/repositories/transaction";
import {
  findRater,
  findTrustStats,
  listRatedRowsOfUser,
  lockUser,
  updateUserById,
} from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import type { PanelInviteCreateInput } from "@/server/validation";
import { recomputeEach, trustFor } from "./ranking.service";
import { DAY_MS } from "./ranking.constants";

export const PANEL_INVITE = {
  maxUses: 30,
  days: 14,
  /** Holds the token between /join/<token> and Google's redirect back. HttpOnly, 30 minutes. */
  cookie: "dishrank_panel_invite",
  cookieSeconds: 30 * 60,
  /** Links listed on /admin/users. */
  listed: 50,
} as const;

export type InviteState = "usable" | "revoked" | "expired" | "full" | "unknown";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function stateOf(
  invite: { maxUses: number; usesCount: number; expiresAt: Date; revokedAt: Date | null } | null,
  now: Date,
): InviteState {
  if (!invite) return "unknown";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  if (invite.usesCount >= invite.maxUses) return "full";
  return "usable";
}

/** The token goes back to the admin once and is never stored or logged. */
export async function createPanelInvite(
  actor: SessionUser | null,
  input: PanelInviteCreateInput,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  const token = randomBytes(32).toString("base64url");
  const invite = await insertPanelInvite({
    tokenHash: hashToken(token),
    label: input.label,
    maxUses: input.maxUses ?? PANEL_INVITE.maxUses,
    expiresAt: new Date(now.getTime() + (input.expiresInDays ?? PANEL_INVITE.days) * DAY_MS),
    createdByUserId: admin.id,
  });
  logEvent("panel_invite.create", {
    userId: admin.id,
    entityId: invite.id,
    maxUses: invite.maxUses,
    expiresAt: invite.expiresAt.toISOString(),
  });
  return { invite, token };
}

/** The links on /admin/users, newest first, with who joined through each. */
export async function listPanelInvites(actor: SessionUser | null, now: Date = new Date()) {
  assertRole(actor, "ADMIN");
  const rows = await listPanelInviteRows(PANEL_INVITE.listed);
  return rows.map((row) => ({ ...row, state: stateOf(row, now) }));
}

export type PanelInviteRow = Awaited<ReturnType<typeof listPanelInvites>>[number];

export async function revokePanelInvite(
  actor: SessionUser | null,
  inviteId: string,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  if (!(await panelInviteExists(inviteId))) {
    throw new AppError("NOT_FOUND", "Invite link not found", 404);
  }
  const changed = await revokePanelInviteById(inviteId, now);
  if (changed > 0) logEvent("panel_invite.revoke", { userId: admin.id, entityId: inviteId });
  return { id: inviteId };
}

/** What a token can do right now: the sign-up hook and /join ask this, and nothing changes. */
export async function getPanelInviteState(token: string, now: Date = new Date()) {
  return stateOf(await findPanelInviteByHash(hashToken(token)), now);
}

export type RedeemOutcome =
  "joined" | "already" | "banned" | "removed" | Exclude<InviteState, "usable">;

/**
 * Makes the user a panel member through this link. Under the link's row lock (then the user's, last
 * as everywhere), so its limit holds however many sign in at once. Someone already on the panel, or
 * already counted on this link, does not use up a place. An admin who turned the panel off for
 * someone is not overruled by any link, and an admin's trust override still wins.
 */
export async function redeemPanelInvite(userId: string, token: string, now: Date = new Date()) {
  const result = await inTransaction(
    async (tx): Promise<{ outcome: RedeemOutcome; inviteId?: string }> => {
      const invite = await lockPanelInviteByHash(hashToken(token), tx);
      if (!invite) return { outcome: "unknown" };
      await lockUser(userId, tx);
      const rater = await findRater(userId, tx);
      if (!rater || rater.bannedAt) return { outcome: "banned" };
      if (rater.isPanel) return { outcome: "already" };
      if (rater.panelRemovedAt) return { outcome: "removed" };
      if (await findPanelInviteUse(invite.id, userId, tx)) return { outcome: "already" };
      const state = stateOf(invite, now);
      if (state !== "usable") return { outcome: state };
      await recordPanelInviteUse(invite.id, userId, tx);
      const stats = await findTrustStats(userId, tx);
      await updateUserById(
        userId,
        {
          isPanel: true,
          trustScore: trustFor({ ...stats!, isPanel: true }),
          // The link's label is the source of whoever joins by it (docs/01 D1b), set once.
          ...(rater.source === null ? { source: invite.label } : {}),
        },
        tx,
      );
      return { outcome: "joined", inviteId: invite.id };
    },
  );
  if (result.outcome !== "joined") return { outcome: result.outcome, dishPages: [] };
  // Trust is read at compute time: the ratings this user already gave count for more now.
  const rows = await listRatedRowsOfUser(userId);
  await recomputeEach(rows);
  logEvent("panel_invite.join", {
    userId,
    entityId: result.inviteId,
    recomputedRows: rows.length,
  });
  return { outcome: result.outcome, dishPages: await listDishPagesOfRows(rows) };
}

/** The link's label, the source of an account created through it (docs/01 D1b); null for no such link. */
export async function getPanelInviteLabel(token: string) {
  const invite = await findPanelInviteByHash(hashToken(token));
  return invite?.label ?? null;
}

/** Why a link cannot be used, in words for the person holding it. */
export function inviteProblem(outcome: Exclude<RedeemOutcome, "joined" | "already">): string {
  if (outcome === "banned") return "This account cannot join the panel.";
  if (outcome === "removed") return "This account was taken off the panel, so a link can't add it.";
  const ask = "Ask whoever sent it for a new one.";
  if (outcome === "full") return `It has been used as many times as it allows. ${ask}`;
  if (outcome === "expired") return `It has expired. ${ask}`;
  return `It no longer works. ${ask}`;
}

/** /join/<token>: what to show this visitor. */
export async function getJoinPageState(
  user: SessionUser | null,
  token: string | null,
  now: Date = new Date(),
) {
  const rater = user ? await findRater(user.id) : null;
  if (rater?.bannedAt) return { kind: "closed" as const, message: inviteProblem("banned") };
  if (rater?.isPanel) return { kind: "member" as const };
  if (rater?.panelRemovedAt) return { kind: "closed" as const, message: inviteProblem("removed") };
  const state = token ? await getPanelInviteState(token, now) : "unknown";
  if (state !== "usable") return { kind: "closed" as const, message: inviteProblem(state) };
  return { kind: "open" as const, signedInAs: user?.name ?? null };
}
