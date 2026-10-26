import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { RECOMPUTE_JOB, recomputeAll } from "@/server/services/ranking-nightly.service";
import { resetAppData } from "../../setup/db-reset";
import { daysAgo, makeDish, makeRating, makeRestaurant, makeUser } from "../restaurants/fixtures";

const SECRET = vi.hoisted(() => "nightly-test-cron-secret-0000000000000000");
vi.mock("@/env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/env")>();
  return { ...mod, env: { ...mod.env, CRON_SECRET: SECRET } };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// A Sunday in Pakistan (11:00 PKT), so the weekly snapshot is due.
const NOW = new Date("2026-10-25T06:00:00Z");
const DISHES = [
  "chicken-karahi",
  "mutton-karahi",
  "namkeen-gosht",
  "chicken-biryani",
  "kabuli-pulao",
];

const trustOf = async (id: string) =>
  (await db.user.findUniqueOrThrow({ where: { id } })).trustScore;
const statusOf = async (id: string) =>
  (await db.restaurantDish.findUniqueOrThrow({ where: { id } })).status;

describe("nightly recomputeAll (docs/04, test DB)", () => {
  beforeEach(async () => {
    await resetAppData();
  });
  afterAll(async () => {
    await resetAppData();
    await db.$disconnect();
  });

  it("recomputes trust, city averages, every rated row, stale rows, ranks and the Sunday snapshot", async () => {
    const a = await makeRestaurant("Nightly A");
    const b = await makeRestaurant("Nightly B");
    const aRows = await Promise.all(
      DISHES.map((d) => makeDish(a, d, { status: "USER_CONFIRMED" })),
    );
    const bRows = await Promise.all(
      DISHES.map((d) => makeDish(b, d, { status: "USER_CONFIRMED" })),
    );
    const fresh = daysAgo(1, NOW);

    // Trust inputs (docs/04 table): 3 active ratings with a photo → 1.0; ten 10s at two
    // restaurants → 0.6 (abuse control 4); 2 hidden ratings → 0.3; panel members keep 1.3.
    const grows = await makeUser("Grows");
    for (const [i, rd] of aRows.slice(0, 3).entries()) {
      await makeRating(rd.id, grows.id, 8, fresh, i === 0 ? { photoPath: `p/${grows.id}` } : {});
    }
    const extreme = await makeUser("Extreme", { trustScore: 1 });
    for (const [i, rd] of [...aRows, ...bRows].entries()) {
      await makeRating(rd.id, extreme.id, 10, daysAgo(1 + i / 100, NOW), {
        photoPath: i < 3 ? `p/${extreme.id}/${i}` : undefined,
      });
    }
    const penalised = await makeUser("Penalised", { trustScore: 1 });
    for (const rd of bRows.slice(0, 2)) {
      await makeRating(rd.id, penalised.id, 2, fresh, { status: "HIDDEN" });
    }
    const panel = [];
    for (let i = 0; i < 3; i++) {
      const p = await makeUser(`Panel ${i}`, { isPanel: true, trustScore: 1.3 });
      await makeRating(aRows[0].id, p.id, 9, fresh);
      panel.push(p);
    }

    // Stale rule: 270 days without a rating or verification (365 for menu/owner verified).
    const c = await makeRestaurant("Nightly C");
    const old = (days: number) => daysAgo(days, NOW);
    const staleCandidate = await makeDish(c, "chicken-tikka", { createdAt: old(300) });
    const verifiedLately = await makeDish(c, "haleem", {
      status: "USER_CONFIRMED",
      createdAt: old(400),
      lastVerifiedAt: old(100),
    });
    const menuVerified = await makeDish(c, "beef-nihari", {
      status: "MENU_VERIFIED",
      createdAt: old(300),
      lastVerifiedAt: old(300),
    });
    const staleOwner = await makeDish(c, "pizza", {
      status: "OWNER_VERIFIED",
      createdAt: old(400),
      lastVerifiedAt: old(400),
    });

    const result = await recomputeAll({ trigger: "cli", now: NOW });

    expect(await trustOf(grows.id)).toBe(1);
    expect(await trustOf(extreme.id)).toBe(0.6);
    expect(await trustOf(penalised.id)).toBe(0.3);
    expect(await trustOf(panel[0].id)).toBe(1.3);

    expect(await statusOf(staleCandidate.id)).toBe("STALE");
    expect(await statusOf(staleOwner.id)).toBe("STALE");
    expect(await statusOf(verifiedLately.id)).toBe("USER_CONFIRMED");
    expect(await statusOf(menuVerified.id)).toBe("MENU_VERIFIED");

    // The karahi row's aggregates were never written: now counted with the new trust (extreme
    // 0.6, grows 1.0, panel 3 × 1.3) and ranked in bootstrap mode.
    const karahi = await db.restaurantDish.findUniqueOrThrow({ where: { id: aRows[0].id } });
    expect(karahi).toMatchObject({ ratingCount: 5, distinctRaters: 5, rankInCity: 1 });
    expect(karahi.weightSum).toBeCloseTo((0.6 + 1 + 3 * 1.3) * 0.5 ** (1 / 180), 6);
    expect(await db.dishStat.count()).toBe(DISHES.length);
    // C for Chicken Karahi: both karahi rows' counted ratings, with the same weights as the rows.
    const decay = (days: number) => 0.5 ** (days / 180);
    const karahiRatings = [
      { w: 1 * decay(1), s: 8 }, // grows
      { w: 0.6 * decay(1), s: 10 }, // extreme at A (newest)
      { w: 0.6 * decay(1.05), s: 10 }, // extreme at B
      ...panel.map(() => ({ w: 1.3 * decay(1), s: 9 })),
    ];
    const stat = await db.dishStat.findFirstOrThrow({ where: { dishId: karahi.dishId } });
    expect(stat.ratingCount).toBe(6);
    expect(stat.meanScore).toBeCloseTo(
      karahiRatings.reduce((sum, r) => sum + r.w * r.s, 0) /
        karahiRatings.reduce((sum, r) => sum + r.w, 0),
      9,
    );

    const snapshots = await db.rankingSnapshot.findMany();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].payload).toEqual([
      { restaurantDishId: karahi.id, rank: 1, score: Number(karahi.score), votes: 5 },
    ]);

    expect(result).toMatchObject({
      ok: true,
      summary: {
        trigger: "cli",
        trust: { changed: 3 },
        dishStats: DISHES.length,
        rows: { recomputed: 10, failed: 0 },
        stale: 2,
        snapshots: 1,
      },
    });
    const runs = await db.jobRun.findMany({ where: { name: RECOMPUTE_JOB } });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: result.jobRunId, ok: true });
    expect(runs[0].finishedAt).not.toBeNull();

    // Run again the same day: nothing new to change, and no second snapshot.
    const again = await recomputeAll({ trigger: "cli", now: new Date(NOW.getTime() + 60_000) });
    expect(again.summary).toMatchObject({ trust: { changed: 0 }, stale: 0, snapshots: 0 });
  });

  it("the cron route runs it with the secret, fails closed without it, and never overlaps", async () => {
    const { GET } = await import("@/app/api/cron/recompute-rankings/route");
    const { revalidatePath } = await import("next/cache");
    const call = (authorization?: string) =>
      GET(
        new Request("http://localhost/api/cron/recompute-rankings", {
          headers: authorization ? { authorization } : {},
        }),
      );

    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${SECRET}x`)).status).toBe(401);
    expect(await db.jobRun.count()).toBe(0);

    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, summary: { trigger: "cron" } });
    expect(await db.jobRun.count({ where: { name: RECOMPUTE_JOB, ok: true } })).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");

    // A run that started and has not finished: a second one is refused.
    await db.jobRun.create({ data: { name: RECOMPUTE_JOB, startedAt: new Date() } });
    const busy = await call(`Bearer ${SECRET}`);
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ ok: false, error: { code: "JOB_RUNNING" } });
  });
});
