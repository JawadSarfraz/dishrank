// /admin/rankings (docs/08 Phase 4): the last runs of the nightly recompute, "Recompute now", and
// each city's launch date. Every function checks the admin role itself (CLAUDE.md rule 6).
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { listCityLaunches, setCityLaunchedAtOnce } from "@/server/repositories/geo.repo";
import { listRecentJobRuns } from "@/server/repositories/ops.repo";
import { findCityBySlug } from "@/server/repositories/public.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import { DAY_MS, RANKING } from "./ranking.constants";
import { RECOMPUTE_JOB, recomputeAll } from "./ranking-nightly.service";
import { thresholdsFor } from "./ranking.service";

export async function getRankingsAdmin(actor: SessionUser | null, now: Date = new Date()) {
  assertRole(actor, "ADMIN");
  const runs = await listRecentJobRuns(RECOMPUTE_JOB, 10);
  const cities = await listCityLaunches();
  return {
    runs,
    cities: cities.map((c) => ({
      slug: c.slug,
      name: c.name,
      launchedAt: c.launchedAt,
      mode: thresholdsFor(c.launchedAt, now).mode,
      bootstrapEndsAt: c.launchedAt
        ? new Date(c.launchedAt.getTime() + RANKING.bootstrapDays * DAY_MS)
        : null,
    })),
  };
}

/** "Recompute now": the nightly job, run at once (409 JOB_RUNNING while another run is going). */
export async function recomputeNow(actor: SessionUser | null) {
  const admin = assertRole(actor, "ADMIN");
  logEvent("admin.rankings.recompute", { userId: admin.id });
  return recomputeAll({ trigger: "admin" });
}

/**
 * Launch day: City.launchedAt = now, once. Early-ranking thresholds still apply for 60 days, so
 * no rank changes today; the nightly job switches the city to the normal thresholds afterwards.
 */
export async function launchCity(
  actor: SessionUser | null,
  citySlug: string,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  const city = await findCityBySlug(citySlug);
  if (!city) throw new AppError("CITY_NOT_FOUND", "City not found", 404);
  const launched = new AppError("CITY_LAUNCHED", "This city was launched already", 409);
  if (city.launchedAt) throw launched;
  if (!(await setCityLaunchedAtOnce(city.id, now))) throw launched;
  logEvent("admin.city.launch", {
    userId: admin.id,
    entityId: city.id,
    launchedAt: now.toISOString(),
  });
  return { slug: city.slug, launchedAt: now.toISOString() };
}
