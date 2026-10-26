// pnpm dev:demo: demo data in a local database, so the rating flow, /me and the admin pages can be
// tried before any real candidate is reviewed. It goes through the app's own services: the
// /admin/import Create path (with the pre-ticked dishes), RatingService (limits, burst rule,
// recompute), proposals and panel locations. Everything is marked: demo users by their e-mail
// domain, restaurant names by "(demo)", the rest through them, and each run is recorded as a
// "dev-demo" job. `undoDemo` removes all of it. Local databases only: scripts/dev-demo.ts checks
// the URLs the client uses (dev-demo-guard.ts), and src/server/db.ts never guesses a server.
import type { Role } from "@/generated/prisma/client";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import {
  countRatingsOfUsers,
  deleteDemoData,
  findCrossMerges,
  findDemoFootprint,
  findDemoRestaurantIds,
  findDishesFromDemoProposals,
  insertDemoUser,
  listDishRowsOfRestaurants,
  listNewLocatedCandidates,
  listUsersByEmailDomain,
  recountRatingCounters,
} from "@/server/repositories/dev-demo.repo";
import { finishJobRun, listJobRuns, startJobRun } from "@/server/repositories/ops.repo";
import { findDishBySlug, listLaunchDishAliases } from "@/server/repositories/taxonomy.repo";
import { inTransaction } from "@/server/repositories/transaction";
import type { SessionUser } from "@/server/roles";
import { candidateCreateInput, ratingInput } from "@/server/validation";
import { refreshUserTrust } from "./admin-users.service";
import { createFromCandidate } from "./import.service";
import { recordLocationObservation } from "./location.service";
import { cleanText } from "./matching/normalize";
import { suggestDishes } from "./overture/dish-hints";
import { propose } from "./proposal.service";
import { DAY_MS, TRUST } from "./ranking.constants";
import { recomputeOne, rerankCityDishes } from "./ranking.service";
import { createOrReplace } from "./rating.service";

export const DEMO = {
  job: "dev-demo",
  /** RFC 2606 reserves .invalid: no Google account has this domain, so no one signs in as these. */
  emailDomain: "dev-demo.invalid",
  nameMark: " (demo)",
  citySlug: "islamabad",
  areaSlugs: ["f-7", "f-6", "blue-area", "g-9"],
  restaurants: 30,
  /** Ratings are spread over the last three weeks. */
  spreadDays: 21,
  seed: 20_261_026,
} as const;

// ---------- plan (pure) ----------

/** Deterministic random numbers in [0, 1) (mulberry32), so every run builds the same demo. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type DemoCandidate = { id: string; name: string; areaSlug: string; dishSlugs: string[] };

/**
 * The most confident candidates, one area at a time in turn so every area gets some; only places
 * with at least one pre-ticked dish, and never two with the same name in one area. `candidates`
 * must be sorted most confident first.
 */
export function pickDemoCandidates<T extends DemoCandidate>(
  candidates: readonly T[],
  areaSlugs: readonly string[],
  count: number,
): T[] {
  const queues = areaSlugs.map((slug) =>
    candidates.filter((c) => c.areaSlug === slug && c.dishSlugs.length > 0),
  );
  const seen = new Set<string>();
  const picked: T[] = [];
  while (picked.length < count && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      if (picked.length >= count) break;
      for (let next = queue.shift(); next; next = queue.shift()) {
        const key = `${next.areaSlug}:${cleanText(next.name)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        picked.push(next);
        break;
      }
    }
  }
  return picked;
}

export type DemoTarget = { restaurantId: string; dishId: string; dishSlug: string };
export type DemoRater = { key: string; bias: number };
export type PlannedRating = {
  userKey: string;
  restaurantId: string;
  dishId: string;
  score: number;
  taste?: number;
  portion?: number;
  value?: number;
  comment?: string;
  at: Date;
};

/** Per dish list: up to four rows that will rank, then one that needs a few more ratings, then rows with none or one. */
export function tierFor(index: number, listSize: number): "ranked" | "almost" | "few" {
  if (listSize < 3) return index === 0 ? "almost" : "few";
  const ranked = Math.min(4, listSize - 1);
  if (index < ranked) return "ranked";
  return index === ranked ? "almost" : "few";
}

const COMMENTS = [
  "Good flavour, would order again.",
  "Generous portion for the price.",
  "A bit too salty for me this time.",
  "Spice level was just right.",
  "Decent, but I have had better nearby.",
  "Bit pricey, but tasty.",
  "Came out quickly and still hot.",
  "Nice smoky taste.",
];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Ratings for the demo targets, oldest first (the rate limiter and the burst rule count earlier
 * writes, so they must arrive in time order). With bootstrap thresholds (4 raters, weight 2.5) a
 * "ranked" row gets the panel member and 3-5 others (1.3 + 3 × 0.6) or 5-6 others (5 × 0.6); an
 * "almost" row gets 2-3 raters and shows "needs N more".
 */
export function planRatings(
  targets: readonly DemoTarget[],
  raters: { regular: readonly DemoRater[]; panel: DemoRater },
  now: Date,
  random: () => number,
): PlannedRating[] {
  const lists = new Map<string, DemoTarget[]>();
  for (const t of targets) lists.set(t.dishSlug, [...(lists.get(t.dishSlug) ?? []), t]);
  const plan: PlannedRating[] = [];
  for (const list of lists.values()) {
    list.forEach((target, index) => {
      const tier = tierFor(index, list.length);
      const others = shuffled(raters.regular, random);
      const who =
        tier === "ranked"
          ? random() < 0.75
            ? [raters.panel, ...others.slice(0, 3 + Math.floor(random() * 3))]
            : others.slice(0, 5 + Math.floor(random() * 2))
          : tier === "almost"
            ? others.slice(0, 2 + Math.floor(random() * 2))
            : others.slice(0, random() < 0.5 ? 1 : 0);
      const quality = 5.5 + random() * 3.5;
      for (const rater of who) {
        const score = clamp(Math.round(quality + rater.bias + (random() - 0.5) * 2), 1, 10);
        const rating: PlannedRating = {
          userKey: rater.key,
          restaurantId: target.restaurantId,
          dishId: target.dishId,
          score,
          // Two to twenty days ago: the scripted events below happen in the last two days.
          at: new Date(now.getTime() - (2 + random() * (DEMO.spreadDays - 3)) * DAY_MS),
        };
        if (random() < 0.4) {
          rating.taste = clamp(Math.round(score / 2 + (random() - 0.5)), 1, 5);
          rating.portion = 1 + Math.floor(random() * 5);
          rating.value = 1 + Math.floor(random() * 5);
        }
        if (random() < 0.3) rating.comment = COMMENTS[Math.floor(random() * COMMENTS.length)];
        plan.push(rating);
      }
    });
  }
  return plan.sort((a, b) => a.at.getTime() - b.at.getTime());
}

// ---------- create ----------

type DemoUserSpec = {
  key: string;
  name: string;
  role: Role;
  isPanel?: boolean;
  ageDays: number;
  bias: number;
};

const USERS: readonly DemoUserSpec[] = [
  // Reviews the candidates (the /admin/import Create path needs an admin); never rates.
  { key: "admin", name: "Demo Admin", role: "ADMIN", ageDays: 200, bias: 0 },
  { key: "panel", name: "Demo Panel Sana", role: "USER", isPanel: true, ageDays: 150, bias: 0 },
  { key: "ayesha", name: "Demo Ayesha", role: "USER", ageDays: 120, bias: 0.5 },
  { key: "bilal", name: "Demo Bilal", role: "USER", ageDays: 110, bias: -0.5 },
  { key: "fatima", name: "Demo Fatima", role: "USER", ageDays: 95, bias: 0 },
  { key: "hamza", name: "Demo Hamza", role: "USER", ageDays: 90, bias: 1 },
  { key: "zara", name: "Demo Zara", role: "USER", ageDays: 80, bias: -1 },
  { key: "usman", name: "Demo Usman", role: "USER", ageDays: 70, bias: 0.3 },
  // Accounts made two days ago: their five ratings of one dish trip the docs/04 burst rule.
  ...[1, 2, 3, 4, 5].map((n) => ({
    key: `new${n}`,
    name: `Demo New ${n}`,
    role: "USER" as const,
    ageDays: 2,
    bias: 0,
  })),
];

/** Overture categories of places where a demo diner may also rate Chicken Karahi. */
const KARAHI_PLACES = new Set(["pakistani_restaurant", "barbecue_restaurant", "restaurant"]);

const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * 3_600_000);

export type DemoSummary = {
  restaurants: { id: string; slug: string; name: string }[];
  users: number;
  ratings: { saved: number; held: number; skipped: number };
  dishRows: number;
  rankedRows: number;
  needsMoreRows: number;
  reviewItems: string[];
  lists: { dish: string; rows: { rank: number; name: string; score: number; votes: number }[] }[];
};

/**
 * Creates the demo: users, about 30 restaurants from the most confident NEW candidates in F-7,
 * F-6, Blue Area and G-9 with their pre-ticked dishes, ratings, and one review item of each Phase 3
 * kind (held comment, burst, dish proposal, restaurant suggestion, location suggestion). Refuses
 * when demo data is already there.
 */
export async function createDemo(
  options: { restaurants?: number; now?: Date } = {},
): Promise<DemoSummary> {
  const now = options.now ?? new Date();
  if ((await listUsersByEmailDomain(DEMO.emailDomain)).length > 0) {
    throw new AppError(
      "DEMO_EXISTS",
      "Demo data is already in this database: run pnpm dev:demo -- --undo first",
      409,
    );
  }
  const [aliases, rows, karahi] = await Promise.all([
    listLaunchDishAliases(),
    listNewLocatedCandidates(DEMO.citySlug, DEMO.areaSlugs),
    findDishBySlug("chicken-karahi"),
  ]);
  const candidates = rows.map((c) => ({
    ...c,
    areaSlug: c.suggestedArea!.slug,
    dishSlugs: [...suggestDishes(c.name, [c.category, ...c.alternates], aliases)].sort(),
  }));
  const picked = pickDemoCandidates(
    candidates,
    DEMO.areaSlugs,
    options.restaurants ?? DEMO.restaurants,
  );
  if (picked.length === 0) {
    throw new AppError(
      "NO_CANDIDATES",
      "No NEW Overture candidates with a pre-ticked dish in F-7, F-6, Blue Area or G-9: run pnpm overture:sync -- --city=islamabad first",
      409,
    );
  }

  const job = await startJobRun(DEMO.job, now);
  const record = { restaurantIds: [] as string[], userIds: [] as string[] };
  try {
    // Users, backdated so only the "new" accounts count as young for the burst rule.
    const users = new Map<string, SessionUser & { bias: number }>();
    for (const spec of USERS) {
      const user = await insertDemoUser({
        email: `${spec.key}@${DEMO.emailDomain}`,
        name: spec.name,
        role: spec.role,
        isPanel: spec.isPanel ?? false,
        trustScore: spec.isPanel ? TRUST.panel : TRUST.newAccount,
        createdAt: new Date(now.getTime() - spec.ageDays * DAY_MS),
      });
      record.userIds.push(user.id);
      users.set(spec.key, { ...user, bias: spec.bias });
    }
    const actor = (key: string) => users.get(key)!;

    // Restaurants, exactly as an admin would create them on /admin/import.
    const restaurants: DemoSummary["restaurants"] = [];
    for (const c of picked) {
      const form = {
        candidateId: c.id,
        name: `${c.name.slice(0, 120 - DEMO.nameMark.length).trim()}${DEMO.nameMark}`,
        areaId: c.suggestedAreaId!,
        address: (c.address ?? `${c.suggestedArea!.name}, ${c.city.name}`).slice(0, 300),
        dishSlugs: c.dishSlugs,
      };
      const full = candidateCreateInput.safeParse({
        ...form,
        phone: c.phone ?? undefined,
        website: c.website ?? undefined,
      });
      const input = full.success ? full.data : candidateCreateInput.parse(form);
      const { restaurant } = await createFromCandidate(actor("admin"), input, now);
      record.restaurantIds.push(restaurant.id);
      restaurants.push({ id: restaurant.id, slug: restaurant.slug, name: restaurant.name });
    }

    // What the demo diners rate: every pre-ticked dish, plus Chicken Karahi at a few Pakistani
    // places (a dish the restaurant does not list yet: RatingService adds the row).
    const dishRows = await listDishRowsOfRestaurants(record.restaurantIds);
    const targets: DemoTarget[] = dishRows.map((r) => ({
      restaurantId: r.restaurantId,
      dishId: r.dishId,
      dishSlug: r.dish.slug,
    }));
    if (karahi) {
      const karahiPlaces = picked
        .map((c, i) => ({ c, restaurant: restaurants[i] }))
        .filter(
          ({ c }) => KARAHI_PLACES.has(c.category ?? "") && !c.dishSlugs.includes(karahi.slug),
        )
        .slice(0, 4);
      for (const { restaurant } of karahiPlaces) {
        targets.push({ restaurantId: restaurant.id, dishId: karahi.id, dishSlug: karahi.slug });
      }
    }
    const random = seededRandom(DEMO.seed);
    const regular = ["ayesha", "bilal", "fatima", "hamza", "zara", "usman"].map((key) => ({
      key,
      bias: actor(key).bias,
    }));
    const plan = planRatings(targets, { regular, panel: { key: "panel", bias: 0 } }, now, random);

    let skipped = 0;
    const rate = async (p: PlannedRating) => {
      const { userKey, at, ...fields } = p;
      try {
        return await createOrReplace(actor(userKey), ratingInput.parse(fields), { now: at });
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "RATE_LIMITED") throw error;
        skipped += 1;
        return null;
      }
    };
    for (const p of plan) await rate(p);

    // Scripted events of the last two days, oldest first.
    const firstVisit = plan.find((p) => p.userKey === "ayesha");
    if (firstVisit) {
      // A second visit: the re-rating replaces the first and keeps it in RatingHistory.
      await rate({
        ...firstVisit,
        score: clamp(firstVisit.score + 1, 1, 10),
        comment: "Second visit: better than the first time.",
        at: hoursAgo(now, 30),
      });
    }
    const almost = targets.find((t) => {
      const list = targets.filter((x) => x.dishSlug === t.dishSlug);
      return tierFor(list.indexOf(t), list.length) === "almost";
    });
    const unratedByBilal = targets.find(
      (t) =>
        t !== almost &&
        !plan.some(
          (p) =>
            p.userKey === "bilal" && p.restaurantId === t.restaurantId && p.dishId === t.dishId,
        ),
    );
    if (unratedByBilal) {
      // A comment with a phone number: the rating is held with a review item.
      await rate({
        userKey: "bilal",
        restaurantId: unratedByBilal.restaurantId,
        dishId: unratedByBilal.dishId,
        score: 9,
        comment: "Call 0300 0000000 for their family deals.",
        at: hoursAgo(now, 26),
      });
    }
    await propose(
      actor("fatima"),
      {
        type: "DISH",
        name: "Kunna Gosht",
        restaurantId: restaurants[0].id,
        note: "Demo data: on the menu here but not in the dish list.",
      },
      hoursAgo(now, 22),
    );
    if (almost) {
      // Five accounts made two days ago rate one dish within a day: the burst rule holds all five.
      for (const [i, hours] of [20, 16, 12, 8, 4].entries()) {
        await rate({
          userKey: `new${i + 1}`,
          restaurantId: almost.restaurantId,
          dishId: almost.dishId,
          score: 10,
          at: hoursAgo(now, hours),
        });
      }
    }
    const g9 = picked.find((c) => c.areaSlug === "g-9") ?? picked[0];
    await propose(
      actor("hamza"),
      {
        type: "RESTAURANT",
        name: `Tikka Corner${DEMO.nameMark}`,
        cityId: g9.city.id,
        areaId: g9.suggestedAreaId!,
        note: "Demo data: a place that is not listed yet.",
      },
      hoursAgo(now, 18),
    );
    // The panel member at a restaurant about 280 m from its Overture point: a location suggestion.
    const located = picked[0];
    await recordLocationObservation(
      actor("panel"),
      {
        restaurantId: restaurants[0].id,
        lat: located.lat! + 0.0025,
        lng: located.lng!,
        accuracyM: 18,
      },
      hoursAgo(now, 6),
    );

    // Every row once more at the real time, so scores and ranks reflect today's decay.
    const finalRows = await listDishRowsOfRestaurants(record.restaurantIds);
    for (const row of finalRows) await recomputeOne(row.id, now);
    const after = await listDishRowsOfRestaurants(record.restaurantIds);
    // Counted at the end: the burst rule also holds ratings that were saved before it fired.
    const counted = await countRatingsOfUsers(record.userIds);
    const ratings = { saved: counted.total, held: counted.held, skipped };

    const lists = new Map<string, DemoSummary["lists"][number]>();
    for (const row of after.filter((r) => r.rankInCity !== null)) {
      const list = lists.get(row.dish.slug) ?? { dish: row.dish.name, rows: [] };
      list.rows.push({
        rank: row.rankInCity!,
        name: row.restaurant.name,
        score: Number(row.score),
        votes: row.distinctRaters,
      });
      lists.set(row.dish.slug, list);
    }
    for (const list of lists.values()) list.rows.sort((a, b) => a.rank - b.rank);

    const summary: DemoSummary = {
      restaurants,
      users: users.size,
      ratings,
      dishRows: after.length,
      rankedRows: after.filter((r) => r.rankInCity !== null).length,
      needsMoreRows: after.filter((r) => r.rankInCity === null && r.distinctRaters > 0).length,
      reviewItems: [
        "held comment",
        ...(almost ? ["burst"] : []),
        "dish proposal",
        "restaurant suggestion",
        "location suggestion",
      ],
      lists: [...lists.values()].sort((a, b) => a.dish.localeCompare(b.dish)),
    };
    await finishJobRun(job.id, {
      ok: true,
      summary: { ...record, ratings, rankedRows: summary.rankedRows },
      finishedAt: new Date(),
    });
    logEvent("dev_demo.create", { restaurants: restaurants.length, ratings: ratings.saved });
    return summary;
  } catch (error) {
    await finishJobRun(job.id, {
      ok: false,
      summary: { ...record, error: error instanceof Error ? error.message : String(error) },
      finishedAt: new Date(),
    });
    throw error;
  }
}

// ---------- undo ----------

const restaurantIdsOf = (summary: unknown): string[] => {
  const ids = (summary as { restaurantIds?: unknown } | null)?.restaurantIds;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
};

/**
 * Removes every demo record: demo users and all they made, demo restaurants (with every rating on
 * them, also real users'), a restaurant or dish an admin created from a demo suggestion, the
 * "dev-demo" job records; reviewed candidates go back to NEW. The lists the demo rows were in are
 * ranked again, and real users who rated demo dishes get their counters and trust recounted.
 */
export async function undoDemo(now: Date = new Date()) {
  const [users, runs] = await Promise.all([
    listUsersByEmailDomain(DEMO.emailDomain),
    listJobRuns(DEMO.job),
  ]);
  const userIds = users.map((u) => u.id);
  const restaurantIds = await findDemoRestaurantIds(
    runs.flatMap((r) => restaurantIdsOf(r.summary)),
    userIds,
    DEMO.nameMark,
  );
  // A merge between a demo restaurant and a real one mixed their ratings, dishes and candidates;
  // undo cannot tell them apart again, so it removes nothing.
  const crossed = await findCrossMerges(restaurantIds);
  if (crossed.length > 0) {
    throw new AppError(
      "DEMO_MERGED",
      `pnpm dev:demo -- --undo refused: ${crossed
        .map((m) => `"${m.source}" was merged into "${m.target}"`)
        .join("; ")}. Demo and real data are mixed there; remove the demo data by hand.`,
      409,
    );
  }
  const proposalDishIds = await findDishesFromDemoProposals(userIds);
  const footprint = await findDemoFootprint(userIds, restaurantIds);
  const deleted = await inTransaction((tx) =>
    deleteDemoData({ userIds, restaurantIds, proposalDishIds, jobName: DEMO.job }, tx),
  );
  await rerankCityDishes(footprint.groups, now);
  for (const id of footprint.rowsRatedElsewhere) await recomputeOne(id, now);
  await recountRatingCounters(footprint.otherRaterIds);
  for (const id of footprint.otherRaterIds) await refreshUserTrust(id);
  logEvent("dev_demo.undo", {
    restaurants: deleted.restaurants,
    users: deleted.users,
    ratings: deleted.ratings,
  });
  return { ...deleted, otherRaters: footprint.otherRaterIds.length };
}
