import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { assertRole, hasRole, toRole, type Role, type SessionUser } from "./roles";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/** Google sign-in is offered only when both credentials are set (src/env.ts requires them in production). */
export const googleSignInEnabled = Boolean(googleClientId && googleClientSecret);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
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
  // Ids come from the Prisma defaults, like every other table.
  advanced: { database: { generateId: false } },
  databaseHooks: {
    user: {
      create: {
        // The first admin: ADMIN_EMAIL gets role ADMIN on first sign-in (docs/10).
        before: async (user) => {
          const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
          if (adminEmail && user.email.toLowerCase() === adminEmail) {
            return { data: { ...user, role: "ADMIN" } };
          }
          return { data: user };
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
