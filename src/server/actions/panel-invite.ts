"use server";
// /join/<token> actions: auth → rate limit → validate → service → revalidate.
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { env } from "@/env";
import { requireUser } from "@/server/auth";
import { AppError } from "@/server/errors";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { clientIp, ipHash } from "@/server/request-ip";
import { revalidateDishPages } from "@/server/revalidate";
import {
  PANEL_INVITE,
  getPanelInviteState,
  inviteProblem,
  redeemPanelInvite,
} from "@/server/services/panel-invite.service";
import { panelInviteToken, parseInput } from "@/server/validation";
import { runAction } from "./result";

/**
 * Before Google: keeps the token in an HttpOnly cookie for the way back, where Better Auth's hooks
 * let the new account past the beta allowlist and make it a panel member (src/server/auth.ts).
 */
export async function startPanelInviteAction(token: unknown) {
  return runAction("panel_invite.start", async () => {
    const ip = ipHash(clientIp(await headers()));
    await assertRateLimit(`ip:${ip}:panel-invite`, RATE_LIMITS.panelInvite);
    const parsed = parseInput(panelInviteToken, token);
    const state = await getPanelInviteState(parsed);
    if (state !== "usable") throw new AppError("INVITE_UNUSABLE", inviteProblem(state), 410);
    (await cookies()).set(PANEL_INVITE.cookie, parsed, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.BETTER_AUTH_URL?.startsWith("https://") ?? false,
      path: "/",
      maxAge: PANEL_INVITE.cookieSeconds,
    });
    return { started: true };
  });
}

/** Someone already signed in joins with one tap. */
export async function joinPanelAction(token: unknown) {
  return runAction("panel_invite.join", async () => {
    const actor = await requireUser();
    await assertRateLimit(`user:${actor.id}:panel-join`, RATE_LIMITS.panelJoin);
    const { outcome, dishPages } = await redeemPanelInvite(
      actor.id,
      parseInput(panelInviteToken, token),
    );
    if (outcome !== "joined" && outcome !== "already") {
      throw new AppError("INVITE_UNUSABLE", inviteProblem(outcome), 410);
    }
    for (const page of dishPages) revalidateDishPages(page);
    refresh();
    return { outcome };
  });
}
