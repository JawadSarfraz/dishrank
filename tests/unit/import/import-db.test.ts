import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { PlacesApiError } from "@/server/places";
import { importCreate, importLink, searchPlacesForImport } from "@/server/services/import.service";
import { resetAppData } from "../../setup/db-reset";
import { fakePlace, scriptedPlaces } from "../places/fake-places";
import { ADMIN, USER, daysAgo, makeDish, makeRestaurant, place } from "../restaurants/fixtures";

// Every name and address here is made up; the Places client is a fake (no network).
const NOW = new Date();
const QUERY = "Chicken Karahi F-7 Islamabad";

const link = (googlePlaceId: string, over: Record<string, unknown> = {}) => ({
  googlePlaceId,
  lat: 33.7215,
  lng: 73.0569,
  fetchedAt: daysAgo(0.01, NOW).toISOString(),
  dishSlug: "chicken-karahi",
  ...over,
});

describe("/admin/import live search (docs/07 §2, test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("searches the dish in the area and flags duplicates by place id, then by name in the area", async () => {
    const { area } = await place("islamabad", "f-7");
    const linked = await makeRestaurant("Fixture Pulao House", {
      googlePlaceId: "ChIJfixturelinked",
    });
    await makeRestaurant("Fixture Karahi");
    await makeRestaurant("Fixture Karahi", { areaSlug: "g-9" }); // other area: not a duplicate
    const { client, seen } = scriptedPlaces({
      [QUERY]: [
        {
          places: [
            fakePlace("linked", { googlePlaceId: "ChIJfixturelinked" }),
            fakePlace("dup", { displayName: "Fixture Karahi and BBQ" }),
            fakePlace("new", { displayName: "Brand New Grill" }),
          ],
          next: "tok-2",
        },
      ],
    });

    const page = await searchPlacesForImport(
      ADMIN,
      { dishSlug: "chicken-karahi", areaId: area.id },
      client,
    );

    expect(seen[0]).toMatchObject({ textQuery: QUERY, includedType: "restaurant" });
    const box = seen[0]!.restriction;
    expect(box.low.lat < area.lat && area.lat < box.high.lat).toBe(true);
    expect(box.low.lng < area.lng && area.lng < box.high.lng).toBe(true);
    expect(page.results.map((r) => r.status)).toEqual(["imported", "possible_duplicate", "new"]);
    // Nothing derived (no suggested area, no distance): exactly these fields, per result and page.
    for (const result of page.results) {
      expect(Object.keys(result).sort()).toEqual([
        "attributions",
        "displayName",
        "duplicates",
        "existing",
        "formattedAddress",
        "googlePlaceId",
        "lat",
        "lng",
        "mapsUrl",
        "status",
      ]);
    }
    expect(Object.keys(page).sort()).toEqual([
      "area",
      "city",
      "dish",
      "fetchedAt",
      "nextPageToken",
      "results",
    ]);
    expect(page.results[0]?.existing).toMatchObject({ id: linked.id, hasDish: false });
    expect(page.results[1]?.duplicates.map((d) => [d.name, d.areaName, d.similarity])).toEqual([
      ["Fixture Karahi", "F-7", 0.65], // 15 of 23 trigrams shared
    ]);
    expect(page.results[1]?.mapsUrl).toBe(
      "https://www.google.com/maps/search/?api=1&query=Chicken+Karahi+F-7+Islamabad&query_place_id=ChIJfixturedup",
    );
    expect(page).toMatchObject({
      nextPageToken: "tok-2",
      area: { id: area.id, name: "F-7" },
      city: { slug: "islamabad" },
    });
  });

  it("Load more sends the same query with the page token, and searching writes nothing", async () => {
    const { area } = await place("islamabad", "f-7");
    await makeRestaurant("Fixture Karahi");
    const { client, seen } = scriptedPlaces({
      [QUERY]: [{ places: [fakePlace("a")], next: "tok-2" }, { places: [fakePlace("b")] }],
    });
    const before = await Promise.all([db.restaurant.count(), db.restaurantDish.count()]);
    await searchPlacesForImport(ADMIN, { dishSlug: "chicken-karahi", areaId: area.id }, client);
    const second = await searchPlacesForImport(
      ADMIN,
      { dishSlug: "chicken-karahi", areaId: area.id, pageToken: "tok-2" },
      client,
    );
    expect(seen[1]).toEqual({ ...seen[0], pageToken: "tok-2" });
    expect(second.nextPageToken).toBeNull();
    expect(await Promise.all([db.restaurant.count(), db.restaurantDish.count()])).toEqual(before);
  });

  it("refuses non-admins and a missing API key, and reports Google errors by status only", async () => {
    const { area } = await place("islamabad", "f-7");
    const input = { dishSlug: "chicken-karahi", areaId: area.id };
    const { client } = scriptedPlaces({
      [QUERY]: [new PlacesApiError(403, "PERMISSION_DENIED")],
    });
    await expect(searchPlacesForImport(USER, input, client)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(searchPlacesForImport(ADMIN, input, null)).rejects.toMatchObject({
      code: "PLACES_KEY_MISSING",
    });
    const error = await searchPlacesForImport(ADMIN, input, client).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "PLACES_ERROR", status: 502 });
    expect((error as Error).message).toContain("403 PERMISSION_DENIED");
  });

  it("compares names with restaurants of every area inside the search rectangle, in both cities", async () => {
    const { area: f7 } = await place("islamabad", "f-7");
    const { area: i10 } = await place("islamabad", "i-10");
    await makeRestaurant("Fixture Karahi", { areaSlug: "f-6" }); // F-6 centre is inside the F-7 box
    await makeRestaurant("Fixture Karahi", { areaSlug: "g-9" }); // G-9 is outside it
    await makeRestaurant("Fixture Karahi", {
      citySlug: "rawalpindi",
      areaSlug: "satellite-town", // inside the I-10 box, across the city line
      googlePlaceId: "ChIJfixtureother",
    });
    const near = scriptedPlaces({
      [QUERY]: [{ places: [fakePlace("x", { displayName: "Fixture Karahi" })] }],
    });
    const f7Page = await searchPlacesForImport(
      ADMIN,
      { dishSlug: "chicken-karahi", areaId: f7.id },
      near.client,
    );
    expect(f7Page.results[0]?.duplicates.map((d) => [d.areaName, d.cityName])).toEqual([
      ["F-6", "Islamabad"],
    ]);

    const twin = scriptedPlaces({
      "Chicken Karahi I-10 Islamabad": [
        { places: [fakePlace("y", { displayName: "Fixture Karahi" })] },
      ],
    });
    const i10Page = await searchPlacesForImport(
      ADMIN,
      { dishSlug: "chicken-karahi", areaId: i10.id },
      twin.client,
    );
    expect(i10Page.results[0]?.duplicates).toMatchObject([
      { areaName: "Satellite Town", cityName: "Rawalpindi", otherGooglePlace: true },
    ]);
  });

  it("shows a result without a location but marks it as not importable", async () => {
    const { area } = await place("islamabad", "f-7");
    const { client } = scriptedPlaces({
      [QUERY]: [{ places: [fakePlace("noloc", { lat: null, lng: null })] }],
    });
    const page = await searchPlacesForImport(
      ADMIN,
      { dishSlug: "chicken-karahi", areaId: area.id },
      client,
    );
    expect(page.results).toMatchObject([{ status: "no_location", lat: null, lng: null }]);
  });

  it("Create saves the typed name and address, the place id, location and fetch time, and a CANDIDATE dish", async () => {
    const { city, area } = await place("islamabad", "f-7");
    const fetchedAt = daysAgo(0.01, NOW).toISOString();
    const { restaurant, restaurantDish } = await importCreate(
      ADMIN,
      {
        name: "Fixture Karahi House", // typed by the admin
        cityId: city.id,
        areaId: area.id,
        address: "Shop 3, Fixture Market",
        lat: 33.7212,
        lng: 73.0571,
        googlePlaceId: "ChIJfixturecreate",
        fetchedAt,
        phone: "03001234567",
        priceBand: 2,
        dishSlug: "chicken-karahi",
      },
      NOW,
    );
    const saved = await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } });
    expect(saved).toMatchObject({
      name: "Fixture Karahi House",
      slug: "fixture-karahi-house-f-7",
      address: "Shop 3, Fixture Market",
      googlePlaceId: "ChIJfixturecreate",
      lat: 33.7212,
      lng: 73.0571,
      phone: "03001234567",
      priceBand: 2,
    });
    expect(saved.googleSyncedAt?.toISOString()).toBe(fetchedAt);
    expect(
      await db.restaurantDish.findUniqueOrThrow({ where: { id: restaurantDish!.id } }),
    ).toMatchObject({
      status: "CANDIDATE",
      source: "GOOGLE_SEARCH",
      confidence: 0.4,
      cityId: city.id,
    });
    await expect(
      importCreate(
        ADMIN,
        {
          name: "Another Name",
          cityId: city.id,
          areaId: area.id,
          address: "Another Address",
          lat: 1,
          lng: 1,
          googlePlaceId: "ChIJfixturecreate",
          fetchedAt,
          dishSlug: "chicken-karahi",
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "PLACE_ALREADY_LINKED" });
  });

  it("Link sets the place on a restaurant without one, never on one with another place", async () => {
    const plain = await makeRestaurant("Fixture Karahi", { lat: 33.7, lng: 73.0 });
    const other = await makeRestaurant("Fixture Pulao House", {
      googlePlaceId: "ChIJfixtureother",
    });
    const row = link("ChIJfixturelink", { dishSlug: "haleem" });

    const linked = await importLink(ADMIN, { restaurantId: plain.id, ...row }, NOW);
    expect(linked).toMatchObject({
      outcome: "linked",
      placeLinked: true,
      restaurantDish: { created: true },
    });
    const saved = await db.restaurant.findUniqueOrThrow({ where: { id: plain.id } });
    expect(saved).toMatchObject({ googlePlaceId: "ChIJfixturelink", lat: row.lat, lng: row.lng });
    expect(saved.googleSyncedAt?.toISOString()).toBe(row.fetchedAt);

    const refused = await importLink(
      ADMIN,
      { restaurantId: other.id, ...link("ChIJfixturex") },
      NOW,
    );
    expect(refused.outcome).toBe("possible_duplicate");
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({
      googlePlaceId: "ChIJfixtureother",
    });
    expect(await db.restaurantDish.count({ where: { restaurantId: other.id } })).toBe(0);
  });

  it("Link never downgrades a stronger dish row and refuses stale fetch times and non-admins", async () => {
    const r = await makeRestaurant("Fixture Pulao House", { googlePlaceId: "ChIJfixturestrong" });
    const strong = await makeDish(r, "chicken-karahi", {
      status: "MENU_VERIFIED",
      source: "MENU_PHOTO",
      confidence: 0.95,
    });
    const row = link("ChIJfixturestrong");
    expect(await importLink(ADMIN, { restaurantId: r.id, ...row }, NOW)).toMatchObject({
      outcome: "linked",
      placeLinked: false,
      restaurantDish: { id: strong.id, created: false, status: "MENU_VERIFIED" },
    });
    expect(await db.restaurantDish.findUniqueOrThrow({ where: { id: strong.id } })).toMatchObject({
      status: "MENU_VERIFIED",
      source: "MENU_PHOTO",
      confidence: 0.95,
    });
    await expect(
      importLink(
        ADMIN,
        { restaurantId: r.id, ...row, fetchedAt: daysAgo(31, NOW).toISOString() },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "GOOGLE_DATA_TOO_OLD" });
    await expect(importLink(USER, { restaurantId: r.id, ...row }, NOW)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
