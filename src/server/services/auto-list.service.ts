// The Auto-list (docs/07 §2a): for one person, reviewing ~1,300 places by hand is too slow, so
// /admin/import/auto-list shows a dry run and Apply creates the clear ones from fixed rules. It only
// ever creates restaurants from NEW candidates: it never changes a restaurant that exists, whoever
// made it, and running it again finds nothing it has already done. It gives no rank and no score
// (CLAUDE.md rule 3): a dish link is a CANDIDATE row that ranks only through real ratings.
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { listCitiesWithAreas } from "@/server/repositories/geo.repo";
import { finishJobRun, listRecentJobRuns, startJobRun } from "@/server/repositories/ops.repo";
import {
  listNewCandidatesForAutoList,
  listReviewedLocatedCandidates,
  lockCandidate,
  updateCandidate,
} from "@/server/repositories/overture.repo";
import { insertCandidateDish } from "@/server/repositories/restaurant-dish.repo";
import {
  findRestaurantByOvertureId,
  listRestaurantsForAutoList,
} from "@/server/repositories/restaurant.repo";
import { listLaunchDishes } from "@/server/repositories/taxonomy.repo";
import { inTransaction, type Tx } from "@/server/repositories/transaction";
import { assertRole, type SessionUser } from "@/server/roles";
import type { AutoListApplyInput } from "@/server/validation";
import {
  AUTO_LIST,
  HOLD_REASONS,
  planAutoList,
  type AutoListPick,
  type HoldReason,
} from "./overture/auto-list";
import { latestOvertureSync } from "./overture-sync.service";
import { insertRestaurantTx } from "./restaurant.service";

export const AUTO_LIST_JOB = "auto-list";
/** A request stops starting new restaurants after this; the page simply calls again. */
const TIME_BUDGET_MS = 45_000;
const SAMPLES = 40;

async function loadPlan() {
  const [candidates, reviewed, restaurants, cities, sync] = await Promise.all([
    listNewCandidatesForAutoList(),
    listReviewedLocatedCandidates(),
    listRestaurantsForAutoList(),
    listCitiesWithAreas(),
    latestOvertureSync(),
  ]);
  const plan = planAutoList({
    candidates,
    restaurants,
    reviewed: reviewed.map((c) => ({ id: c.id, name: c.name, lat: c.lat!, lng: c.lng! })),
    usedOvertureIds: new Set(restaurants.flatMap((r) => (r.overtureId ? [r.overtureId] : []))),
    release: sync?.release ?? null,
    areaNames: cities.flatMap((c) => c.areas.map((a) => a.name)),
  });
  return { ...plan, candidates, cities, release: sync?.release ?? null };
}

function countBy<T>(items: readonly T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The dry run on /admin/import/auto-list: nothing is written. */
export async function previewAutoList(actor: SessionUser | null) {
  assertRole(actor, "ADMIN");
  const [{ picks, held, candidates, cities, release }, launchDishes, runs] = await Promise.all([
    loadPlan(),
    listLaunchDishes(),
    listRecentJobRuns(AUTO_LIST_JOB, 5),
  ]);
  const areaName = new Map(cities.flatMap((c) => c.areas.map((a) => [a.id, a.name] as const)));
  const dishName = new Map(launchDishes.map((d) => [d.slug, d.name]));
  const pickIds = new Set(picks.map((p) => p.id));

  const bands = Array.from({ length: 10 }, (_, i) => {
    const inBand = candidates.filter((c) => Math.min(9, Math.floor(c.confidence * 10)) === i);
    return {
      from: i / 10,
      to: (i + 1) / 10,
      all: inBand.length,
      withAreaAndLocation: inBand.filter((c) => c.lat !== null && c.suggestedAreaId).length,
      listed: inBand.filter((c) => pickIds.has(c.id)).length,
    };
  });
  const renamed = picks.filter((p) => p.cleanName !== p.name);

  return {
    floor: AUTO_LIST.minConfidence,
    release,
    newCandidates: candidates.length,
    toCreate: picks.length,
    dishLinks: picks.reduce((sum, p) => sum + p.dishSlugs.length, 0),
    withDishLink: picks.filter((p) => p.dishSlugs.length > 0).length,
    cities: cities.map((city) => {
      const ofCity = picks.filter((p) => city.areas.some((a) => a.id === p.suggestedAreaId));
      return {
        name: city.name,
        count: ofCity.length,
        areas: countBy(ofCity, (p) => areaName.get(p.suggestedAreaId) ?? "?"),
      };
    }),
    categories: countBy(picks, (p) => (p.category ?? "").replace(/_/g, " ")),
    dishes: countBy(
      picks.flatMap((p) => p.dishSlugs),
      (slug) => dishName.get(slug) ?? slug,
    ),
    held: (Object.keys(HOLD_REASONS) as HoldReason[])
      .map((reason) => ({
        reason,
        label: HOLD_REASONS[reason],
        count: held.filter((h) => h.reason === reason).length,
      }))
      .filter((h) => h.count > 0),
    bands,
    renamedCount: renamed.length,
    renamed: renamed.slice(0, SAMPLES).map((p) => ({ from: p.name, to: p.cleanName })),
    heldByName: held
      .filter((h) => h.reason === "NAME" || h.reason === "NOT_EATING")
      .slice(0, SAMPLES)
      .map((h) => ({ id: h.row.id, name: h.row.name, label: HOLD_REASONS[h.reason] })),
    runs: runs.map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      ok: r.ok,
      summary: r.summary as { created?: number; remaining?: number; failed?: number } | null,
    })),
  };
}

export type AutoListPreview = Awaited<ReturnType<typeof previewAutoList>>;

/** One restaurant: everything or nothing. Null when an admin decided on the candidate meanwhile. */
async function createFromPick(
  pick: AutoListPick,
  admin: SessionUser,
  dishIds: ReadonlyMap<string, string>,
  now: Date,
  tx: Tx,
) {
  const candidate = await lockCandidate(pick.id, tx);
  if (!candidate || candidate.status !== "NEW") return null;
  if (await findRestaurantByOvertureId(pick.overtureId, tx)) return null;
  const restaurant = await insertRestaurantTx(
    {
      name: pick.cleanName,
      areaId: pick.suggestedAreaId,
      address: pick.address,
      phone: pick.phone,
      website: pick.website,
      source: "OVERTURE",
      overtureId: pick.overtureId,
      location: { lat: pick.lat, lng: pick.lng, source: "OVERTURE" },
      autoListedAt: now,
    },
    tx,
  );
  const dishSlugs: string[] = [];
  for (const slug of pick.dishSlugs) {
    const dishId = dishIds.get(slug);
    if (!dishId) continue; // no longer a launch dish
    await insertCandidateDish(
      {
        restaurantId: restaurant.id,
        dishId,
        cityId: restaurant.cityId,
        source: "AUTO_LIST",
        confidence: AUTO_LIST.dishConfidence,
      },
      tx,
    );
    dishSlugs.push(slug);
  }
  await updateCandidate(
    candidate.id,
    {
      status: "CREATED",
      restaurantId: restaurant.id,
      reviewedByUserId: admin.id,
      reviewedAt: now,
      autoListedAt: now,
    },
    tx,
  );
  return { restaurant, dishSlugs };
}

/**
 * Apply: creates up to `limit` restaurants, strongest first, each in its own transaction, so an
 * interrupted run loses nothing and the next one carries on. The plan is worked out again on every
 * call, from what is in the database by then.
 */
export async function applyAutoListBatch(
  actor: SessionUser | null,
  input: AutoListApplyInput,
  now: Date = new Date(),
) {
  const admin = assertRole(actor, "ADMIN");
  const started = Date.now();
  const run = await startJobRun(AUTO_LIST_JOB, now);
  const { picks, cities } = await loadPlan();
  const dishIds = new Map((await listLaunchDishes()).map((d) => [d.slug, d.id]));
  const citySlug = new Map(cities.map((c) => [c.id, c.slug]));
  const batch = picks.slice(0, input.limit ?? AUTO_LIST.batchSize);

  const paths = new Set<string>();
  const createdIds: string[] = [];
  let dishLinks = 0;
  let skipped = 0;
  let failed = 0;
  for (const pick of batch) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const created = await inTransaction((tx) => createFromPick(pick, admin, dishIds, now, tx));
      if (!created) {
        skipped++;
        continue;
      }
      createdIds.push(created.restaurant.id);
      dishLinks += created.dishSlugs.length;
      const city = citySlug.get(created.restaurant.cityId);
      for (const slug of created.dishSlugs) paths.add(`/${city}/best-${slug}`);
      if (created.dishSlugs.length > 0) paths.add(`/${city}`).add("/");
    } catch (error) {
      // One bad record stops only itself; the page reports it and the candidate stays NEW.
      failed++;
      logEvent(
        "autolist.failed",
        {
          candidateId: pick.id,
          error: error instanceof AppError ? error.code : (error as Error)?.name,
        },
        "error",
      );
    }
  }
  const remaining = Math.max(0, picks.length - createdIds.length - skipped - failed);
  const summary = {
    userId: admin.id,
    floor: AUTO_LIST.minConfidence,
    created: createdIds.length,
    dishLinks,
    skipped,
    failed,
    remaining,
    durationMs: Date.now() - started,
  };
  await finishJobRun(run.id, { ok: failed === 0, summary, finishedAt: new Date() });
  logEvent("autolist.apply", { ...summary, restaurantIds: createdIds });
  return { created: createdIds.length, dishLinks, skipped, failed, remaining, paths: [...paths] };
}
