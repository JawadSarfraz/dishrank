// The public origin, for canonical URLs, OpenGraph and JSON-LD (NEXT_PUBLIC_SITE_URL, docs/10).
import { env } from "@/env";

export const SITE_URL = (
  env.NEXT_PUBLIC_SITE_URL ??
  env.BETTER_AUTH_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

export const absoluteUrl = (path: string) => `${SITE_URL}${path}`;

/** The year in Pakistan, for titles such as "Best Chicken Karahi in Islamabad (2026)". */
export const yearInPakistan = (now: Date = new Date()) =>
  new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Karachi" }).format(now);
