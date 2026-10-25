import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { recordLocationObservation } from "@/server/services/location.service";
import { propose } from "@/server/services/proposal.service";
import { locationObservationInput } from "@/server/validation";
import { resetAppData } from "../../setup/db-reset";
import { actorOf, makeRestaurant, makeUser, place } from "../restaurants/fixtures";

const F7 = { lat: 33.7215, lng: 73.0569 };
const metresNorth = (m: number) => ({ lat: F7.lat + m / 111_200, lng: F7.lng });

describe("proposals (docs/07 §6, test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("files dish and restaurant suggestions as review items only, once per person", async () => {
    const user = await makeUser("Diner");
    const r = await makeRestaurant("Fixture Karahi");
    const { city, area } = await place("islamabad", "g-9");
    const dish = await propose(actorOf(user), {
      type: "DISH",
      name: "Lahori Fish",
      restaurantId: r.id,
      note: "Fried, winter only",
    });
    const again = await propose(actorOf(user), {
      type: "DISH",
      name: "lahori  fish",
      restaurantId: r.id,
    });
    expect(again).toEqual({ id: dish.id, type: "DISH_PROPOSAL", duplicate: true });
    const restaurant = await propose(actorOf(user), {
      type: "RESTAURANT",
      name: "Fixture New Dhaba",
      cityId: city.id,
      areaId: area.id,
    });
    const items = await db.reviewItem.findMany({ orderBy: { createdAt: "asc" } });
    expect(items.map((i) => [i.type, i.status, i.createdByUserId])).toEqual([
      ["DISH_PROPOSAL", "OPEN", user.id],
      ["RESTAURANT_PROPOSAL", "OPEN", user.id],
    ]);
    expect(items[0]).toMatchObject({ restaurantId: r.id, payload: { name: "Lahori Fish" } });
    expect(items[1]).toMatchObject({ id: restaurant.id, payload: { areaId: area.id } });
    expect(await db.dish.count({ where: { name: "Lahori Fish" } })).toBe(0); // never a dish
    expect(await db.restaurant.count()).toBe(1); // never a restaurant

    const { area: saddar } = await place("rawalpindi", "saddar");
    await expect(
      propose(actorOf(user), {
        type: "RESTAURANT",
        name: "X Y",
        cityId: city.id,
        areaId: saddar.id,
      }),
    ).rejects.toMatchObject({ code: "AREA_NOT_IN_CITY" });
  });

  it("limits suggestions to 5 a day", async () => {
    const user = await makeUser("Busy");
    for (let i = 0; i < 5; i++)
      await propose(actorOf(user), { type: "DISH", name: `Dish number ${i}` });
    await expect(
      propose(actorOf(user), { type: "DISH", name: "One more dish" }),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});

describe("panel location observations (docs/07 §7, test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  const observe = (
    user: Parameters<typeof actorOf>[0],
    restaurantId: string,
    at: { lat: number; lng: number },
    accuracyM = 12,
  ) => recordLocationObservation(actorOf(user), { restaurantId, ...at, accuracyM });

  it("only panel members, only 50 m or better", async () => {
    const diner = await makeUser("Diner");
    const panel = await makeUser("Panel", { isPanel: true, trustScore: 1.3 });
    const r = await makeRestaurant("Fixture Located", { ...F7, locationSource: "OVERTURE" });
    await expect(observe(diner, r.id, F7)).rejects.toMatchObject({
      code: "PANEL_ONLY",
      status: 403,
    });
    expect(
      locationObservationInput.safeParse({ restaurantId: r.id, ...F7, accuracyM: 51 }).success,
    ).toBe(false);
    await expect(observe(panel, r.id, F7, 51)).rejects.toMatchObject({
      code: "LOCATION_TOO_COARSE",
    });
    expect(await db.locationObservation.count()).toBe(0);
  });

  it("an observation near the known location is kept without a suggestion", async () => {
    const panel = await makeUser("Panel", { isPanel: true, trustScore: 1.3 });
    const r = await makeRestaurant("Fixture Near", { ...F7, locationSource: "OVERTURE" });
    expect(await observe(panel, r.id, metresNorth(80))).toMatchObject({
      suggestion: "none",
      distanceM: 80,
    });
    expect(await db.locationObservation.count()).toBe(1);
    expect(await db.reviewItem.count()).toBe(0);
  });

  it("an unknown or far-off location gets one suggestion that keeps the most accurate observation", async () => {
    const panel = await makeUser("Panel", { isPanel: true, trustScore: 1.3 });
    const unknown = await makeRestaurant("Fixture Unknown");
    expect(await observe(panel, unknown.id, F7, 30)).toMatchObject({
      suggestion: "created",
      distanceM: null,
    });
    expect(await observe(panel, unknown.id, metresNorth(10), 8)).toMatchObject({
      suggestion: "updated",
    });
    const far = await makeRestaurant("Fixture Far", { ...F7, locationSource: "OVERTURE" });
    expect(await observe(panel, far.id, metresNorth(400))).toMatchObject({
      suggestion: "created",
      distanceM: 400,
    });

    const items = await db.reviewItem.findMany({
      where: { type: "LOCATION_SUGGESTION" },
      orderBy: { createdAt: "asc" },
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ restaurantId: unknown.id, status: "OPEN" });
    expect(items[0].payload).toMatchObject({ best: { accuracyM: 8 }, current: null });
    expect((items[0].payload as { observationIds: string[] }).observationIds).toHaveLength(2);
    expect(items[1].payload).toMatchObject({ distanceM: 400, current: { source: "OVERTURE" } });
    // The observation never touches the restaurant until an admin accepts it.
    expect((await db.restaurant.findUniqueOrThrow({ where: { id: unknown.id } })).lat).toBeNull();
  });
});
