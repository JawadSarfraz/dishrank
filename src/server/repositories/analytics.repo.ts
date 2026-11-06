// Light analytics (owner, Phase 6): event rows with a name, city and dish slug and a day; nothing
// about who.
import type { AnalyticsEventName } from "@/generated/prisma/client";
import { db } from "@/server/db";

export async function insertAnalyticsEvent(data: {
  name: AnalyticsEventName;
  citySlug: string | null;
  dishSlug: string | null;
  day: Date;
}) {
  await db.analyticsEvent.create({ data, select: { id: true } });
}

/** Events per week (weeks start on Monday) and name since `since`, newest week first. */
export async function countEventsByWeek(since: Date) {
  return db.$queryRaw<{ week: Date; name: AnalyticsEventName; count: number }[]>`
    SELECT date_trunc('week', day)::date AS week, name, count(*)::int AS count
    FROM "AnalyticsEvent"
    WHERE day >= ${since}
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2`;
}

/**
 * Distinct raters per week since `since` (weeks start on Monday, Pakistan time), and how many of
 * them had also rated in an earlier week. Counts only: no user leaves this query. A rating counts
 * in the week it was given and the week of its last edit; a rating an admin hid does not count.
 */
// DECISION-PENDING: "returning" is rated this week and in any earlier week.
export async function countRatersByWeek(since: Date) {
  return db.$queryRaw<{ week: Date; raters: number; returning: number }[]>`
    WITH rated AS (
      SELECT "userId", date_trunc('week', "createdAt" + interval '5 hours')::date AS week
      FROM "Rating" WHERE status <> 'HIDDEN'
      UNION
      SELECT "userId", date_trunc('week', "updatedAt" + interval '5 hours')::date AS week
      FROM "Rating" WHERE status <> 'HIDDEN'
    ),
    firsts AS (SELECT "userId", min(week) AS week FROM rated GROUP BY "userId")
    SELECT r.week, count(*)::int AS raters,
      (count(*) FILTER (WHERE r.week > f.week))::int AS returning
    FROM rated r JOIN firsts f ON f."userId" = r."userId"
    WHERE r.week >= ${since}
    GROUP BY r.week`;
}

/** The most viewed ranking pages since `since`. */
export async function topRankingViews(since: Date, take: number) {
  const rows = await db.analyticsEvent.groupBy({
    by: ["citySlug", "dishSlug"],
    where: { name: "RANKING_VIEW", day: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take,
  });
  return rows.map((r) => ({ citySlug: r.citySlug, dishSlug: r.dishSlug, views: r._count._all }));
}
