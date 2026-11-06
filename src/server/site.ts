// The public origin, for canonical URLs, OpenGraph and JSON-LD (NEXT_PUBLIC_SITE_URL, docs/10),
// the site mode (beta or live) and who runs the site.
import type { MetadataRoute } from "next";
import { env } from "@/env";
import { siteModeFrom, type SiteMode } from "@/lib/site-mode";

export const SITE_URL = (
  env.NEXT_PUBLIC_SITE_URL ??
  env.BETTER_AUTH_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

export const absoluteUrl = (path: string) => `${SITE_URL}${path}`;

/** "kahankhayen.com": the address as people read it, drawn on every share image. */
export const SITE_HOST = new URL(SITE_URL).host;

/** The year in Pakistan, for titles such as "Best Chicken Karahi in Islamabad (2026)". */
export const yearInPakistan = (now: Date = new Date()) =>
  new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Karachi" }).format(now);

/** beta until SITE_MODE=live (the production default, src/lib/site-mode.ts). */
export const SITE_MODE: SiteMode = siteModeFrom({
  SITE_MODE: env.SITE_MODE,
  NODE_ENV: env.NODE_ENV,
});
export const isBeta = SITE_MODE === "beta";

/** robots.txt: in beta nothing may be crawled; live keeps private and signed-in pages out. */
export function robotsFor(mode: SiteMode): MetadataRoute.Robots {
  if (mode === "beta") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/owner", "/me", "/rate", "/sign-in", "/join", "/api"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

/** Named on /privacy and /terms; null shows a placeholder (OPERATOR_NAME, CONTACT_EMAIL). */
export const OPERATOR = {
  name: env.OPERATOR_NAME ?? null,
  email: env.CONTACT_EMAIL ?? null,
};

/**
 * A new account: whether it may be created, and whether it is the admin. Only an e-mail Google
 * marks as verified counts. Beta: only the invited accounts (BETA_ALLOWED_EMAILS, comma- or
 * space-separated) and ADMIN_EMAIL, because Google's "Testing" status does not limit plain Sign in
 * with Google; an empty list lets only the admin in. Live: everyone. Existing accounts are not
 * affected. ADMIN_EMAIL becomes ADMIN in both modes. `invited`: the visitor came through a usable
 * panel invite link (docs/07 §7a), which passes the beta list like an invited address.
 */
// Decided 2026-11-04: in beta without BETA_ALLOWED_EMAILS only ADMIN_EMAIL can sign up (closed by default).
export function newAccountDecision(
  user: { email: string; emailVerified?: boolean | null },
  input: { mode: SiteMode; allowed?: string; adminEmail?: string; invited?: boolean },
): { allowed: boolean; admin: boolean } {
  const email = user.email.trim().toLowerCase();
  const verified = user.emailVerified === true && email !== "";
  const admin = verified && input.adminEmail?.trim().toLowerCase() === email;
  if (input.mode === "live") return { allowed: true, admin };
  const listed = (input.allowed ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return {
    allowed: verified && (admin || Boolean(input.invited) || listed.includes(email)),
    admin,
  };
}
