"use server";
// /admin/users actions: auth → rate limit → validate → service → revalidate.
import { refresh } from "next/cache";
import { panelInvitePath } from "@/lib/panel-invite";
import { requireRole } from "@/server/auth";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { revalidateDishPages } from "@/server/revalidate";
import { safeNextPath } from "@/server/roles";
import { setPanel, setTrustOverride } from "@/server/services/admin-users.service";
import { createPanelInvite, revokePanelInvite } from "@/server/services/panel-invite.service";
import { absoluteUrl } from "@/server/site";
import {
  adminPanelInput,
  adminTrustInput,
  panelInviteCreateInput,
  parseInput,
} from "@/server/validation";
import { id } from "@/server/validation/common";
import { runAction } from "./result";

/** Panel on (trust 1.3) or off (trust from the docs/04 table); the user's rows are recomputed. */
export async function setPanelAction(userId: unknown, input: unknown) {
  return runAction("admin.user.panel", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const { isPanel } = parseInput(adminPanelInput, input);
    const result = await setPanel(actor, parseInput(id, userId), isPanel);
    // The user's trust changed: so did the scores of every row their ratings count in.
    for (const page of result.dishPages) revalidateDishPages(page);
    refresh();
    return result;
  });
}

/** A new panel invite link. The whole link goes back once, here; only its hash is stored. */
export async function createPanelInviteAction(input: unknown) {
  return runAction("panel_invite.create", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const parsed = parseInput(panelInviteCreateInput, input);
    const { invite, token } = await createPanelInvite(actor, parsed);
    refresh();
    return {
      id: invite.id,
      url: absoluteUrl(panelInvitePath(token, safeNextPath(parsed.next))),
    };
  });
}

export async function revokePanelInviteAction(inviteId: unknown) {
  return runAction("panel_invite.revoke", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const result = await revokePanelInvite(actor, parseInput(id, inviteId));
    refresh();
    return result;
  });
}

/** A trust score set by hand (kept by the nightly job), or null to return to the trust table. */
export async function setTrustOverrideAction(userId: unknown, input: unknown) {
  return runAction("admin.user.trust", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const { trustOverride } = parseInput(adminTrustInput, input);
    const result = await setTrustOverride(actor, parseInput(id, userId), trustOverride);
    for (const page of result.dishPages) revalidateDishPages(page);
    refresh();
    return result;
  });
}
