import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  createRestaurant,
  getPublicRestaurant,
  searchRestaurants,
  setRestaurantStatus,
  updateRestaurant,
} from "@/server/services/restaurant.service";
import { resetAppData } from "../../setup/db-reset";
import { ADMIN, USER, makeRestaurant, place } from "./fixtures";

async function input(name: string, over: Record<string, unknown> = {}) {
  const { area } = await place("islamabad", "f-7");
  return {
    name,
    areaId: area.id,
    address: "Plot 1, Fixture Market",
    lat: 33.7215,
    lng: 73.0569,
    ...over,
  };
}

describe("RestaurantService (test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("checks the role itself (rule 6)", async () => {
    await expect(createRestaurant(USER, await input("X"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(createRestaurant(null, await input("X"))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("gives every restaurant a unique slug with the area suffix", async () => {
    const created = await Promise.all(
      ["Fixture Karahi", "Fixture Karahi", "Fixture Karahi"].map(async (name) =>
        createRestaurant(ADMIN, await input(name)),
      ),
    );
    expect(created.map((c) => c.restaurant.slug).sort()).toEqual([
      "fixture-karahi-f-7",
      "fixture-karahi-f-7-2",
      "fixture-karahi-f-7-3",
    ]);
  });

  it("adds a restaurant by hand: source MANUAL, a typed location, ticked dishes as candidates", async () => {
    const { restaurant, dishes } = await createRestaurant(
      ADMIN,
      await input("Fixture Dhaba", {
        website: "https://fixture-dhaba.example",
        dishSlugs: ["chai", "halwa-puri", "chai"],
      }),
    );
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } })).toMatchObject({
      source: "MANUAL",
      overtureId: null,
      website: "https://fixture-dhaba.example",
      lat: 33.7215,
      lng: 73.0569,
      locationSource: "ADMIN",
    });
    expect(dishes.map((d) => [d.status, d.created])).toEqual([
      ["CANDIDATE", true],
      ["CANDIDATE", true],
    ]);
    expect(
      await db.restaurantDish.findMany({
        where: { restaurantId: restaurant.id },
        select: { source: true, confidence: true },
      }),
    ).toEqual([
      { source: "ADMIN", confidence: 0.4 },
      { source: "ADMIN", confidence: 0.4 },
    ]);
  });

  it("takes the city from the area; the location is optional", async () => {
    const { city, area } = await place("rawalpindi", "saddar");
    const { restaurant } = await createRestaurant(
      ADMIN,
      await input("Fixture Saddar Tikka", { areaId: area.id, lat: undefined, lng: undefined }),
    );
    const row = await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } });
    expect(row).toMatchObject({
      cityId: city.id,
      areaId: area.id,
      lat: null,
      lng: null,
      locationSource: null,
    });
    await expect(
      createRestaurant(ADMIN, await input("X", { areaId: "nosucharea0000" })),
    ).rejects.toMatchObject({ code: "AREA_NOT_FOUND" });
  });

  it('search "but karahi" finds "Butt Karahi" (typo, trigram ≥ 0.3), only ACTIVE, only in the city', async () => {
    await makeRestaurant("Butt Karahi");
    await makeRestaurant("Butt Karahi Fixture Closed", { status: "CLOSED" });
    await makeRestaurant("Butt Karahi", { citySlug: "rawalpindi", areaSlug: "saddar" });
    await makeRestaurant("Fixture Grill");
    const hits = await searchRestaurants({ city: "islamabad", q: "but karahi" });
    expect(hits.map((h) => [h.name, h.area])).toEqual([["Butt Karahi", "F-7"]]);
  });

  it("finds a word inside a long name through the ILIKE fallback and other names through aliases", async () => {
    await makeRestaurant("Fixture Afghani Pulao and Tikka House Restaurant");
    await makeRestaurant("Fixture Biryani", { aliases: ["Fixture Biryani Testpur Chowk"] });
    expect((await searchRestaurants({ city: "islamabad", q: "pulao" })).map((h) => h.name)).toEqual(
      ["Fixture Afghani Pulao and Tikka House Restaurant"],
    );
    expect(
      (await searchRestaurants({ city: "islamabad", q: "testpur" })).map((h) => h.name),
    ).toEqual(["Fixture Biryani"]);
    expect(await searchRestaurants({ city: "islamabad", q: "!!!" })).toEqual([]);
    await expect(searchRestaurants({ city: "lahore", q: "x" })).rejects.toMatchObject({
      code: "CITY_NOT_FOUND",
    });
  });

  it("edits a restaurant: new search text, same slug; coordinates can be typed and cleared", async () => {
    const { area } = await place("islamabad", "f-6");
    const r = await makeRestaurant("Fixture Chai Corner", {
      source: "OVERTURE",
      lat: 33.72,
      lng: 73.05,
      locationSource: "OVERTURE",
    });
    const edit = {
      name: "Fixture Chai Corner F-6",
      areaId: area.id,
      address: "Plot 12, Fixture Market",
      phone: "0300 1234567",
      website: "https://fixture-chai.example",
      priceBand: 2,
      aliases: ["fixture chai"],
    };
    const out = await updateRestaurant(ADMIN, r.id, edit);
    expect(out.slug).toBe(r.slug);
    const row = await db.restaurant.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({
      name: "Fixture Chai Corner F-6",
      phone: "0300 1234567", // services get validated input; Zod normalises phones before this
      aliases: ["fixture chai"],
      searchText: "fixture chai corner f 6 fixture chai",
      website: "https://fixture-chai.example",
      source: "OVERTURE", // never changes
    });
    const location = async () =>
      db.restaurant.findUniqueOrThrow({
        where: { id: r.id },
        select: { lat: true, lng: true, locationSource: true },
      });
    // Saving the same coordinates keeps their source; new ones are the admin's; none = unknown.
    await updateRestaurant(ADMIN, r.id, { ...edit, lat: 33.72, lng: 73.05 });
    expect(await location()).toEqual({ lat: 33.72, lng: 73.05, locationSource: "OVERTURE" });
    await updateRestaurant(ADMIN, r.id, { ...edit, lat: 33.7, lng: 73.1 });
    expect(await location()).toEqual({ lat: 33.7, lng: 73.1, locationSource: "ADMIN" });
    await updateRestaurant(ADMIN, r.id, { ...edit, lat: null, lng: null });
    expect(await location()).toEqual({ lat: null, lng: null, locationSource: null });
  });

  it("changes status; a CLOSED restaurant leaves search and its page", async () => {
    const r = await makeRestaurant("Fixture Cafe");
    await setRestaurantStatus(ADMIN, r.id, "CLOSED");
    expect(await searchRestaurants({ city: "islamabad", q: "fixture cafe" })).toEqual([]);
    expect(await getPublicRestaurant(r.slug)).toEqual({ kind: "not_found" });
    await setRestaurantStatus(ADMIN, r.id, "ACTIVE");
    expect((await getPublicRestaurant(r.slug)).kind).toBe("found");
  });
});
