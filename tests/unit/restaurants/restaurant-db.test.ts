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
import { ADMIN, USER, daysAgo, makeRestaurant, place } from "./fixtures";

async function input(name: string, over: Record<string, unknown> = {}) {
  const { city, area } = await place("islamabad", "f-7");
  return {
    name,
    cityId: city.id,
    areaId: area.id,
    address: "F-7 Markaz, Islamabad",
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
      ["Butt Karahi", "Butt Karahi", "Butt Karahi"].map(async (name) =>
        createRestaurant(ADMIN, await input(name)),
      ),
    );
    expect(created.map((c) => c.restaurant.slug).sort()).toEqual([
      "butt-karahi-f-7",
      "butt-karahi-f-7-2",
      "butt-karahi-f-7-3",
    ]);
  });

  it("stores googleSyncedAt = fetchedAt and refuses Google data older than 30 days", async () => {
    const fetchedAt = daysAgo(3);
    const { restaurant } = await createRestaurant(
      ADMIN,
      await input("Savour Foods", {
        googlePlaceId: "ChIJ-savour-0001",
        fetchedAt: fetchedAt.toISOString(),
      }),
    );
    const row = await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } });
    expect(row.googleSyncedAt?.toISOString()).toBe(fetchedAt.toISOString());

    await expect(
      createRestaurant(
        ADMIN,
        await input("Old Row", {
          googlePlaceId: "ChIJ-old-00001",
          fetchedAt: daysAgo(31).toISOString(),
        }),
      ),
    ).rejects.toMatchObject({ code: "GOOGLE_DATA_TOO_OLD" });
    await expect(
      createRestaurant(
        ADMIN,
        await input("Savour Again", {
          googlePlaceId: "ChIJ-savour-0001",
          fetchedAt: fetchedAt.toISOString(),
        }),
      ),
    ).rejects.toMatchObject({ code: "PLACE_ALREADY_LINKED" });
  });

  it("refuses an area of another city", async () => {
    const { area } = await place("rawalpindi", "saddar");
    await expect(
      createRestaurant(ADMIN, await input("X", { areaId: area.id })),
    ).rejects.toMatchObject({
      code: "AREA_NOT_IN_CITY",
    });
  });

  it('search "but karahi" finds "Butt Karahi" (typo, trigram ≥ 0.3), only ACTIVE, only in the city', async () => {
    await makeRestaurant("Butt Karahi");
    await makeRestaurant("Butt Karahi Tikka", { status: "CLOSED" });
    await makeRestaurant("Butt Karahi", { citySlug: "rawalpindi", areaSlug: "saddar" });
    await makeRestaurant("Monal");
    const hits = await searchRestaurants({ city: "islamabad", q: "but karahi" });
    expect(hits.map((h) => [h.name, h.area])).toEqual([["Butt Karahi", "F-7"]]);
  });

  it("finds a word inside a long name through the ILIKE fallback and other names through aliases", async () => {
    await makeRestaurant("Kabul Restaurant Afghani Pulao and Tikka House");
    await makeRestaurant("Usmania", { aliases: ["Usmania Lakshmi Chowk"] });
    expect((await searchRestaurants({ city: "islamabad", q: "pulao" })).map((h) => h.name)).toEqual(
      ["Kabul Restaurant Afghani Pulao and Tikka House"],
    );
    expect(
      (await searchRestaurants({ city: "islamabad", q: "lakshmi" })).map((h) => h.name),
    ).toEqual(["Usmania"]);
    expect(await searchRestaurants({ city: "islamabad", q: "!!!" })).toEqual([]);
    await expect(searchRestaurants({ city: "lahore", q: "x" })).rejects.toMatchObject({
      code: "CITY_NOT_FOUND",
    });
  });

  it("edits a restaurant: new search text, same slug; Google coordinates cannot be typed", async () => {
    const { area } = await place("islamabad", "f-6");
    const r = await makeRestaurant("Chaaye Khana", { googlePlaceId: "ChIJ-chaaye-001" });
    const edit = {
      name: "Chaaye Khana F-6",
      areaId: area.id,
      address: "Super Market",
      phone: "0300 1234567",
      priceBand: 2,
      aliases: ["chai khana"],
    };
    const out = await updateRestaurant(ADMIN, r.id, edit);
    expect(out.slug).toBe(r.slug);
    const row = await db.restaurant.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({
      name: "Chaaye Khana F-6",
      phone: "0300 1234567", // services get validated input; Zod normalises phones before this
      aliases: ["chai khana"],
      searchText: "chaaye khana f 6 chai khana",
    });
    await expect(
      updateRestaurant(ADMIN, r.id, { ...edit, lat: 33.7, lng: 73.1 }),
    ).rejects.toMatchObject({
      code: "COORDINATES_FROM_GOOGLE",
    });
  });

  it("changes status; a CLOSED restaurant leaves search and its page", async () => {
    const r = await makeRestaurant("Cafe Aylanto");
    await setRestaurantStatus(ADMIN, r.id, "CLOSED");
    expect(await searchRestaurants({ city: "islamabad", q: "aylanto" })).toEqual([]);
    expect(await getPublicRestaurant(r.slug)).toEqual({ kind: "not_found" });
    await setRestaurantStatus(ADMIN, r.id, "ACTIVE");
    expect((await getPublicRestaurant(r.slug)).kind).toBe("found");
  });
});
