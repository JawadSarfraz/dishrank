import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  getAnalyticsAdmin,
  pakistanDay,
  recordBrowserEvent,
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
    await recordBrowserEvent(
      { name: "ranking_view", city: "islamabad", dish: "chicken-karahi", source: "wa" },
      "a".repeat(32),
    );
    await expect(
      recordBrowserEvent(
        { name: "ranking_view", city: "islamabad", dish: "no-such-dish" },
        "a".repeat(32),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const diner = await makeUser("Diner");
    // The account's source (docs/01 D1b) rides along with its ratings.
    await db.user.update({ where: { id: diner.id }, data: { source: "ig" } });
    const restaurant = await makeRestaurant("Analytics Karahi");
    await createOrReplace(actorOf(diner), {
      restaurantId: restaurant.id,
      dishId: await dishId("chicken-karahi"),
      score: 8,
    });
    await listDishes({ city: "islamabad", q: "karahi", launchOnly: false });

    const events = await db.analyticsEvent.findMany({ orderBy: { name: "asc" } });
    // Only these columns exist: nothing about who, no search text, no time of day; the source is
    // a channel tag (docs/01 D1b).
    expect(Object.keys(events[0]!).sort()).toEqual([
      "citySlug",
      "day",
      "dishSlug",
      "id",
      "name",
      "source",
    ]);
    expect(events.map((e) => [e.name, e.citySlug, e.dishSlug, e.source])).toEqual([
      ["RATING_SUBMITTED", "islamabad", "chicken-karahi", "ig"],
      ["SEARCH", "islamabad", null, null],
      ["RANKING_VIEW", "islamabad", "chicken-karahi", "wa"],
    ]);

    const admin = actorOf(await makeUser("Admin", { role: "ADMIN" }));
    const report = await getAnalyticsAdmin(admin);
    expect(report.weeks[0]).toMatchObject({ ratings: 1, searches: 1, rankingViews: 1 });
    expect(report.thisWeek).toEqual([
      { citySlug: "islamabad", dishSlug: "chicken-karahi", views: 1 },
    ]);
    // Per source: the visit's tag on views, the account's source on new raters and ratings.
    expect(report.sources.map((s) => [s.source, s.views, s.newRaters, s.ratings])).toEqual([
      ["wa", 1, 0, 0],
      ["ig", 0, 1, 1],
    ]);
    await expect(getAnalyticsAdmin(diner as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
