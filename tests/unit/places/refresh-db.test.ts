import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { PlacesApiError, type PlaceDetailsResult } from "@/server/places";
import { refreshPlaces } from "@/server/services/places-refresh.service";
import { resetAppData } from "../../setup/db-reset";
import { daysAgo, makeRestaurant } from "../restaurants/fixtures";

// docs/07 §5 day rules with a fake clock and a fake Place Details client: no network.
const NOW = new Date("2026-10-25T22:00:00Z");
const clock = (at: Date) => () => at;
const ok = (lat: number, lng: number, at = NOW): PlaceDetailsResult => ({
  kind: "ok",
  lat,
  lng,
  fetchedAt: at,
});
const notFound: PlaceDetailsResult = { kind: "not_found", message: "Place ID is no longer valid" };
const unavailable = new PlacesApiError(503, "UNAVAILABLE", "Backend error");

function fakePlaces(answers: Record<string, PlaceDetailsResult | PlacesApiError>) {
  const asked: string[] = [];
  return {
    asked,
    get calls() {
      return asked.length;
    },
    async placeDetails(placeId: string) {
      asked.push(placeId);
      const answer = answers[placeId];
      if (!answer) throw new Error(`unexpected place ${placeId}`);
      if (answer instanceof PlacesApiError) throw answer;
      return answer;
    },
  };
}

const google = (id: string, syncedDaysAgo: number | null) => ({
  googlePlaceId: `p-${id}`,
  googleSyncedAt: syncedDaysAgo === null ? null : daysAgo(syncedDaysAgo, NOW),
  lat: 33.7,
  lng: 73.05,
});

const reload = (id: string) => db.restaurant.findUniqueOrThrow({ where: { id } });
const items = (restaurantId: string) =>
  db.reviewItem.findMany({ where: { restaurantId, type: "PLACE_REFRESH_FAILED" } });

describe("refresh-places (docs/07 §5, test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("refreshes rows synced more than 25 days ago or never, oldest first, and logs a JobRun", async () => {
    const fresh = await makeRestaurant("Fresh", google("fresh", 10));
    const due = await makeRestaurant("Due", google("due", 26));
    const never = await makeRestaurant("Never", google("never", null));
    const manual = await makeRestaurant("Manual", { lat: 33.6, lng: 73.0 });
    const places = fakePlaces({ "p-due": ok(33.71, 73.06), "p-never": ok(33.72, 73.07) });

    const run = await refreshPlaces({ places, now: clock(NOW) });

    expect(places.asked).toEqual(["p-never", "p-due"]);
    expect(run.summary).toMatchObject({ selected: 2, calls: 2, ok: 2, nulled: 0, reviewItems: 0 });
    expect(await reload(due.id)).toMatchObject({ lat: 33.71, lng: 73.06, googleSyncedAt: NOW });
    expect(await reload(never.id)).toMatchObject({ lat: 33.72, lng: 73.07, googleSyncedAt: NOW });
    expect(await reload(fresh.id)).toMatchObject({ lat: 33.7, googleSyncedAt: daysAgo(10, NOW) });
    expect(await reload(manual.id)).toMatchObject({ lat: 33.6, googleSyncedAt: null });
    const job = await db.jobRun.findUniqueOrThrow({ where: { id: run.jobRunId } });
    expect(job).toMatchObject({ name: "refresh-places", ok: true, startedAt: NOW });
    expect(job.summary).toMatchObject({ selected: 2, calls: 2, ok: 2, skippedForTime: 0 });
  });

  it("NOT_FOUND nulls lat/lng at once and opens one review item, also on later runs", async () => {
    const gone = await makeRestaurant("Gone", google("gone", 26));
    await refreshPlaces({ places: fakePlaces({ "p-gone": notFound }), now: clock(NOW) });
    expect(await reload(gone.id)).toMatchObject({ lat: null, lng: null, googlePlaceId: "p-gone" });
    const [item] = await items(gone.id);
    expect(item).toMatchObject({ status: "OPEN" });
    expect(item?.payload).toEqual({
      restaurantId: gone.id,
      googlePlaceId: "p-gone",
      error: "NOT_FOUND: Place ID is no longer valid",
      googleSyncedAt: daysAgo(26, NOW).toISOString(),
    });

    const nextDay = new Date(NOW.getTime() + 86_400_000);
    const again = await refreshPlaces({
      places: fakePlaces({ "p-gone": notFound }),
      now: clock(nextDay),
    });
    expect(again.summary).toMatchObject({ notFound: 1, nulled: 0, reviewItems: 0 });
    expect(await items(gone.id)).toHaveLength(1);
  });

  it("keeps the coordinates after other errors until the row is 28 days old", async () => {
    const day27 = await makeRestaurant("Day 27", google("d27", 27.9));
    const day28 = await makeRestaurant("Day 28", google("d28", 28));
    const run = await refreshPlaces({
      places: fakePlaces({ "p-d27": unavailable, "p-d28": unavailable }),
      now: clock(NOW),
    });
    expect(run.summary).toMatchObject({ errors: 2, nulled: 1, reviewItems: 1 });
    expect(await reload(day27.id)).toMatchObject({ lat: 33.7 });
    expect(await items(day27.id)).toHaveLength(0);
    expect(await reload(day28.id)).toMatchObject({ lat: null, lng: null });
    expect((await items(day28.id))[0]?.payload).toMatchObject({
      error: "503 UNAVAILABLE: Backend error",
    });
  });

  it("catch-up nulls rows past 29 days first; a successful refresh then resolves the item", async () => {
    const late = await makeRestaurant("Late", google("late", 31));
    const run = await refreshPlaces({
      places: fakePlaces({ "p-late": ok(33.75, 73.08) }),
      now: clock(NOW),
    });
    expect(run.summary).toMatchObject({
      caughtUp: 1,
      nulled: 1,
      reviewItems: 1,
      ok: 1,
      resolvedReviewItems: 1,
    });
    expect(await reload(late.id)).toMatchObject({ lat: 33.75, lng: 73.08, googleSyncedAt: NOW });
    const [item] = await items(late.id);
    expect(item).toMatchObject({
      status: "RESOLVED",
      resolution: "Resolved automatically: the location refresh succeeded",
    });
  });

  it("keeps the 30-day rule without an API key and marks the run failed", async () => {
    const late = await makeRestaurant("Late", google("late", 29.5));
    const due = await makeRestaurant("Due", google("due", 26));
    const run = await refreshPlaces({ places: null, now: clock(NOW) });
    expect(run.ok).toBe(false);
    expect(run.summary).toMatchObject({
      caughtUp: 1,
      errors: 2,
      calls: 0,
      error: "GOOGLE_PLACES_API_KEY is not set",
    });
    expect(await reload(late.id)).toMatchObject({ lat: null });
    expect(await reload(due.id)).toMatchObject({ lat: 33.7 });
  });

  it("stops before the time budget and leaves the rest for the next run", async () => {
    for (const id of ["a", "b", "c"]) await makeRestaurant(id.toUpperCase(), google(id, 26));
    let elapsed = -120_000;
    const run = await refreshPlaces({
      places: fakePlaces({ "p-a": ok(33.7, 73), "p-b": ok(33.7, 73), "p-c": ok(33.7, 73) }),
      now: clock(NOW),
      elapsedMs: () => (elapsed += 120_000), // 0 s, 120 s, 240 s
    });
    expect(run.summary).toMatchObject({ selected: 3, ok: 2, skippedForTime: 1 });
  });
});
