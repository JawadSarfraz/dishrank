// /admin/rankings (docs/08 Phase 4): the last runs of the nightly recompute, "Recompute now", and
// when each city's early rankings end (City.launchedAt + 60 days). Every function checks the admin
// role itself (CLAUDE.md rule 6).
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import {
  countRankedRowsByCity,
  listCityLaunches,
  listFeaturedDishes,
  replaceFeaturedDishes,
  setCityLaunchedAtOnce,
} from "@/server/repositories/geo.repo";
import { listRecentJobRuns } from "@/server/repositories/ops.repo";
import { findCityBySlug } from "@/server/repositories/public.repo";
import { findDishesBySlugs, listLaunchDishes } from "@/server/repositories/taxonomy.repo";
import { inTransaction } from "@/server/repositories/transaction";
import { assertRole, type SessionUser } from "@/server/roles";
import type { FeaturedInput } from "@/server/validation";
import { endOfPakistanDay, pakistanDayOf } from "./featured";
import { DAY_MS, RANKING } from "./ranking.constants";
import { RECOMPUTE_JOB, recomputeAll } from "./ranking-nightly.service";
import { thresholdsFor } from "./ranking.service";

export async function getRankingsAdmin(actor: SessionUser | null, now: Date = new Date()) {
  assertRole(actor, "ADMIN");
  const runs = await listRecentJobRuns(RECOMPUTE_JOB, 10);
  const cities = await listCityLaunches();
  const ranked = await countRankedRowsByCity(RANKING.normal);
  const launchDishes = (await listLaunchDishes()).map((d) => ({ slug: d.slug, name: d.name }));
  return {
    runs,
    launchDishes,
    cities: cities.map((c) => {
      const counts = ranked.find((r) => r.cityId === c.id);
      return {
        slug: c.slug,
        name: c.name,
        launchedAt: c.launchedAt,
        mode: thresholdsFor(c.launchedAt, now).mode,
        bootstrapEndsAt: c.launchedAt
          ? new Date(c.launchedAt.getTime() + RANKING.bootstrapDays * DAY_MS)
          : null,
        /** What the button's confirm step shows: pressing it today would end them on this day. */
        wouldEndOn: new Date(now.getTime() + RANKING.bootstrapDays * DAY_MS),
        rankedNow: counts?.ranked ?? 0,
        stillRankedUnderNormalRules: counts?.kept ?? 0,
        /** The featured round (docs/01 Home): what the form shows. */
        featured: {
          dishSlugs: c.featured.map((f) => f.dish.slug),
          roundName: c.featuredRound,
          closesOn: c.featuredClosesAt ? pakistanDayOf(c.featuredClosesAt) : null,
        },
      };
    }),
  };
}

/**
 * "Featured dishes" on /admin/rankings: replaces a city's one or two featured dishes and sets the
 * round's name and closing day (end of that day in Pakistan). Returns every dish page that changes,
 * the old ones included, so the caller can revalidate them.
 */
export async function setFeatured(actor: SessionUser | null, input: FeaturedInput) {
  const admin = assertRole(actor, "ADMIN");
  const city = await findCityBySlug(input.city);
  if (!city) throw new AppError("CITY_NOT_FOUND", "City not found", 404);
  const slugs = [...new Set(input.dishSlugs)];
  const dishes = await findDishesBySlugs(slugs);
  if (dishes.length !== slugs.length) {
    throw new AppError("DISH_NOT_FOUND", "Pick dishes from the list", 400);
  }
  const previous = (await listFeaturedDishes(city.id)).map((f) => f.dish.slug);
  const round = {
    featuredClosesAt: input.closesOn ? endOfPakistanDay(input.closesOn) : null,
    featuredRound: input.roundName ?? null,
  };
  await inTransaction((tx) =>
    replaceFeaturedDishes(
      city.id,
      slugs.map((s) => dishes.find((d) => d.slug === s)!.id),
      round,
      tx,
    ),
  );
  logEvent("admin.city.featured", {
    userId: admin.id,
    entityId: city.id,
    dishSlugs: slugs,
    ...round,
  });
  return { slug: city.slug, dishSlugs: [...new Set([...previous, ...slugs])] };
}

/** "Recompute now": the nightly job, run at once (409 JOB_RUNNING while another run is going). */
export async function recomputeNow(actor: SessionUser | null) {
  const admin = assertRole(actor, "ADMIN");
  logEvent("admin.rankings.recompute", { userId: admin.id });
  return recomputeAll({ trigger: "admin" });
}

/**
 * "End early rankings in 60 days": City.launchedAt = now, once. It does not start anything: a city
 * is in early rankings until this is set. They go on for 60 days, so no rank changes today; then
 * the nightly job switches the city to the normal thresholds and every row below them loses its
 * rank. Going live is SITE_MODE, a separate decision (docs/DEPLOY-CHECKLIST.md).
 */
export async function launchCity(
  actor: SessionUser | null,
  citySlug: string,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  const city = await findCityBySlug(citySlug);
  if (!city) throw new AppError("CITY_NOT_FOUND", "City not found", 404);
  const launched = new AppError(
    "CITY_LAUNCHED",
    "This city's early rankings already have an end date",
    409,
  );
  if (city.launchedAt) throw launched;
  if (!(await setCityLaunchedAtOnce(city.id, now))) throw launched;
  logEvent("admin.city.launch", {
    userId: admin.id,
    entityId: city.id,
    launchedAt: now.toISOString(),
  });
  return { slug: city.slug, launchedAt: now.toISOString() };
}
