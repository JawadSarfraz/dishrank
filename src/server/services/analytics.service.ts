// Light analytics (owner, Phase 6): ratings, searches, ranking views, share clicks and sign-ins,
// counted per day with at most the city and dish: no user, no IP, no query text, no exact time, no
// third-party tracker. Recording never fails the request it belongs to.
import type { AnalyticsEventName } from "@/generated/prisma/client";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import {
  countEventsByWeek,
  countRatersByWeek,
  insertAnalyticsEvent,
  topRankingViews,
} from "@/server/repositories/analytics.repo";
import { findCityBySlug } from "@/server/repositories/public.repo";
import { findDishBySlug } from "@/server/repositories/taxonomy.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import type { BrowserEventInput } from "@/server/validation";
import { DAY_MS } from "./ranking.constants";

const PKT_OFFSET_MS = 5 * 3_600_000; // Pakistan has no daylight saving

/** The day in Pakistan, as a date (midnight UTC of that calendar day). */
export function pakistanDay(now: Date): Date {
  const local = new Date(now.getTime() + PKT_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

// DECISION-PENDING: every dish or restaurant search request with text counts (the browser searches as
// you type, after a pause), with its city only.
/** Counts one event; a failure is logged, never thrown. */
export async function recordEvent(
  name: AnalyticsEventName,
  where: { citySlug?: string | null; dishSlug?: string | null },
  now: Date = new Date(),
) {
  try {
    await insertAnalyticsEvent({
      name,
      citySlug: where.citySlug ?? null,
      dishSlug: where.dishSlug ?? null,
      day: pakistanDay(now),
    });
  } catch (error) {
    logEvent(
      "analytics.record_failed",
      { name, error: error instanceof Error ? error.message : String(error) },
      "warn",
    );
  }
}

const BROWSER_EVENTS = {
  ranking_view: "RANKING_VIEW",
  share_click: "SHARE_CLICK",
  sign_in_started: "SIGN_IN_STARTED",
  in_app_sign_in_started: "IN_APP_SIGN_IN_STARTED",
  in_app_left_browser: "IN_APP_LEFT_BROWSER",
} as const satisfies Record<BrowserEventInput["name"], AnalyticsEventName>;

/**
 * POST /api/v1/events: what only the browser can see (the pages are static). An event about a page
 * is counted for existing city and dish slugs only; limited per IP hash (`ip:{hash}:event`).
 */
export async function recordBrowserEvent(
  input: BrowserEventInput,
  ipHash: string,
  now = new Date(),
) {
  await assertRateLimit(`ip:${ipHash}:event`, RATE_LIMITS.event, now);
  const name = BROWSER_EVENTS[input.name];
  if (!("city" in input)) {
    await recordEvent(name, {}, now);
    return { ok: true };
  }
  const [city, dish] = await Promise.all([findCityBySlug(input.city), findDishBySlug(input.dish)]);
  if (!city || !dish) throw new AppError("NOT_FOUND", "Unknown city or dish", 404);
  await recordEvent(name, { citySlug: city.slug, dishSlug: dish.slug }, now);
  return { ok: true };
}

export const ANALYTICS_WEEKS = 12;

/** /admin/analytics: weekly counts of each event, and this week's and the last 4 weeks' top pages. */
export async function getAnalyticsAdmin(actor: SessionUser | null, now: Date = new Date()) {
  assertRole(actor, "ADMIN");
  const today = pakistanDay(now);
  // Monday of this week (UTC dates; getUTCDay 0 = Sunday).
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS);
  const since = new Date(monday.getTime() - (ANALYTICS_WEEKS - 1) * 7 * DAY_MS);
  const [rows, raters, thisWeek, lastFourWeeks] = await Promise.all([
    countEventsByWeek(since),
    countRatersByWeek(since),
    topRankingViews(monday, 10),
    topRankingViews(new Date(monday.getTime() - 3 * 7 * DAY_MS), 10),
  ]);
  const weeks = Array.from({ length: ANALYTICS_WEEKS }, (_, i) => {
    const week = new Date(monday.getTime() - i * 7 * DAY_MS);
    const count = (name: AnalyticsEventName) =>
      rows.find((r) => r.name === name && r.week.getTime() === week.getTime())?.count ?? 0;
    const people = raters.find((r) => r.week.getTime() === week.getTime());
    return {
      week,
      ratings: count("RATING_SUBMITTED"),
      raters: people?.raters ?? 0,
      returningRaters: people?.returning ?? 0,
      searches: count("SEARCH"),
      rankingViews: count("RANKING_VIEW"),
      shareClicks: count("SHARE_CLICK"),
      signInStarted: count("SIGN_IN_STARTED"),
      signInCompleted: count("SIGN_IN_COMPLETED"),
      inAppStarted: count("IN_APP_SIGN_IN_STARTED"),
      inAppLeft: count("IN_APP_LEFT_BROWSER"),
      inAppCompleted: count("IN_APP_SIGN_IN_COMPLETED"),
    };
  });
  return { weeks, thisWeek, lastFourWeeks };
}
