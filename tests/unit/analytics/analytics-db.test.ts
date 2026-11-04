import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  getAnalyticsAdmin,
  pakistanDay,
  recordRankingView,
} from "@/server/services/analytics.service";
import { listDishes } from "@/server/services/dish.service";
import { createOrReplace } from "@/server/services/rating.service";
import { resetAppData } from "../../setup/db-reset";
import { actorOf, dishId, makeRestaurant, makeUser } from "../restaurants/fixtures";

describe("light analytics (Phase 6)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("counts per Pakistan day with the city and dish only; unknown pages are refused", async () => {
    // 20:30 UTC is 01:30 the next day in Pakistan.
    expect(pakistanDay(new Date("2026-11-04T20:30:00Z")).toISOString()).toBe(
      "2026-11-05T00:00:00.000Z",
    );
    await recordRankingView(
      { name: "ranking_view", city: "islamabad", dish: "chicken-karahi" },
      "a".repeat(32),
    );
    await expect(
      recordRankingView(
        { name: "ranking_view", city: "islamabad", dish: "no-such-dish" },
        "a".repeat(32),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const diner = await makeUser("Diner");
    const restaurant = await makeRestaurant("Analytics Karahi");
    await createOrReplace(actorOf(diner), {
      restaurantId: restaurant.id,
      dishId: await dishId("chicken-karahi"),
      score: 8,
    });
    await listDishes({ city: "islamabad", q: "karahi", launchOnly: false });

    const events = await db.analyticsEvent.findMany({ orderBy: { name: "asc" } });
    // Only these columns exist: nothing about who, no search text, no time of day.
    expect(Object.keys(events[0]!).sort()).toEqual(["citySlug", "day", "dishSlug", "id", "name"]);
    expect(events.map((e) => [e.name, e.citySlug, e.dishSlug])).toEqual([
      ["RATING_SUBMITTED", "islamabad", "chicken-karahi"],
      ["SEARCH", "islamabad", null],
      ["RANKING_VIEW", "islamabad", "chicken-karahi"],
    ]);

    const admin = actorOf(await makeUser("Admin", { role: "ADMIN" }));
    const report = await getAnalyticsAdmin(admin);
    expect(report.weeks[0]).toMatchObject({ ratings: 1, searches: 1, rankingViews: 1 });
    expect(report.thisWeek).toEqual([
      { citySlug: "islamabad", dishSlug: "chicken-karahi", views: 1 },
    ]);
    await expect(getAnalyticsAdmin(diner as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
