import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, getOAuthState } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env } from "@/env";
import { db } from "./db";
import { logEvent } from "./log";
import { assertRole, hasRole, toRole, type Role, type SessionUser } from "./roles";
import { revalidateDishPages } from "./revalidate";
import { recordEvent } from "./services/analytics.service";
import { isEmailBanned } from "./services/ban-list";
import {
  PANEL_INVITE,
  getPanelInviteState,
  redeemPanelInvite,
} from "./services/panel-invite.service";
import { SITE_MODE, newAccountDecision } from "./site";
import { panelInviteToken } from "./validation";
import { BRAND } from "@/lib/brand";
import { isJoinWelcomeUrl } from "@/lib/panel-invite";

const googleClientId = env.GOOGLE_CLIENT_ID;
const googleClientSecret = env.GOOGLE_CLIENT_SECRET;

/**
 * The invite this sign-in started from on /join/<token>, from its HttpOnly cookie (docs/07 §7a). Only
 * a sign-in that names the join path counts, so a cookie left by an abandoned sign-in gives nothing to
 * the next person who signs in on that browser.
 */
async function panelInviteOf(ctx: { getCookie(key: string): string | null } | null | undefined) {
  const parsed = panelInviteToken.safeParse(ctx?.getCookie(PANEL_INVITE.cookie));
  if (!parsed.success) return null;
  const state = await getOAuthState().catch(() => null);
  return isJoinWelcomeUrl(state?.callbackURL) ? parsed.data : null;
}

/** Google sign-in is offered only when both credentials are set (src/env.ts requires them in production). */
export const googleSignInEnabled = Boolean(googleClientId && googleClientSecret);

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  socialProviders:
    googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {},
  user: {
    additionalFields: {
      // Returned on the session user; `input: false` means no client request can ever set it.
      role: { type: "string", input: false, defaultValue: "USER" },
    },
  },
  // Every check reads the session and role from the database, so role changes apply at once.
  session: { cookieCache: { enabled: false } },
  // Kahan Khayen has no profile editing: Better Auth's own update-user endpoint (an unbounded name and
  // image for any signed-in user) answers 404 (audit 2026-11, A-09).
  disabledPaths: ["/update-user"],
  // Ids come from the Prisma defaults, like every other table.
  advanced: { database: { generateId: false } },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          // A banned account that deleted itself may not come back (ban list, audit 2026-11 A-01).
          if (await isEmailBanned(user.email)) {
            logEvent("auth.signup_refused", { reason: "banned" }, "warn");
            throw new APIError("FORBIDDEN", {
              code: "ACCOUNT_BANNED",
              message: `This Google account was banned from ${BRAND.name} and cannot sign up again.`,
            });
          }
          // Private beta: only invited Google accounts get an account (BETA_ALLOWED_EMAILS, docs/10);
          // the OAuth callback sends anyone else to /sign-in?error=BETA_INVITE_ONLY. The first
          // admin: ADMIN_EMAIL gets role ADMIN on first sign-in (docs/10).
          const invite = await panelInviteOf(ctx);
          const decision = newAccountDecision(user, {
            mode: SITE_MODE,
            allowed: env.BETA_ALLOWED_EMAILS,
            adminEmail: env.ADMIN_EMAIL,
            invited: invite !== null && (await getPanelInviteState(invite)) === "usable",
          });
          if (!decision.allowed) {
            logEvent("auth.signup_refused", { reason: "beta_invite_only" }, "warn");
            throw new APIError("FORBIDDEN", {
              code: "BETA_INVITE_ONLY",
              message: `${BRAND.name} is a private beta and this Google account is not invited.`,
            });
          }
          return { data: decision.admin ? { ...user, role: "ADMIN" } : user };
        },
      },
    },
    session: {
      create: {
        // Whoever signs in through a panel invite link joins the panel, new account or not. A
        // problem here never blocks the sign-in: /join/<token> then offers the one-tap join.
        after: async (session, ctx) => {
          // Counted with no user (docs/06); `via` is the browser's own word, and only a count.
          const state = await getOAuthState().catch(() => null);
          if (state) {
            const inApp = state.via === "in-app";
            await recordEvent(inApp ? "IN_APP_SIGN_IN_COMPLETED" : "SIGN_IN_COMPLETED", {});
          }
          if (!ctx?.getCookie(PANEL_INVITE.cookie)) return;
          try {
            const invite = await panelInviteOf(ctx);
            ctx.setCookie(PANEL_INVITE.cookie, "", { maxAge: 0, path: "/" });
            if (!invite) return;
            const { dishPages } = await redeemPanelInvite(session.userId, invite);
            for (const page of dishPages) revalidateDishPages(page);
          } catch (error) {
            logEvent(
              "panel_invite.redeem_failed",
              { error: error instanceof Error ? error.name : "unknown" },
              "error",
            );
          }
        },
      },
    },
  },
  plugins: [nextCookies()], // keep last
});

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, email, name } = session.user;
  return { id, email, name, role: toRole((session.user as { role?: unknown }).role) };
});

/** For server actions and route handlers: throws AppError UNAUTHENTICATED (401) without a session. */
export async function requireUser(): Promise<SessionUser> {
  return assertRole(await getSessionUser(), ["USER", "OWNER", "ADMIN"]);
}

/** For server actions and route handlers: throws AppError 401 without a session, 403 for the wrong role. */
export async function requireRole(allowed: Role | readonly Role[]): Promise<SessionUser> {
  return assertRole(await getSessionUser(), allowed);
}

/**
 * For layouts and pages under admin/ and owner/. Signed out → redirect to /sign-in with a callbackUrl.
 * Wrong role → null: the caller renders <Forbidden /> and fetches no data.
 * (next/navigation `forbidden()` is not used: it is still experimental in Next.js 16.)
 */
export async function requirePageRole(
  allowed: Role | readonly Role[],
  callbackPath: string,
): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackPath)}`);
  return hasRole(user, allowed) ? user : null;
}
