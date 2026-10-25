import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { encodeCandidatesCsv, type CandidateRow } from "@/server/services/candidates-csv";
import { importCreate, importLink, previewImport } from "@/server/services/import.service";
import { resetAppData } from "../../setup/db-reset";
import { ADMIN, USER, daysAgo, makeDish, makeRestaurant, place } from "../restaurants/fixtures";

const NOW = new Date();
const F7 = { lat: 33.7215, lng: 73.0569 };

const row = (id: string, displayName: string, over: Partial<CandidateRow> = {}): CandidateRow => ({
  googlePlaceId: `ChIJ-${id}-000000`,
  displayName,
  formattedAddress: `${displayName}, F-7 Markaz, Islamabad`,
  ...F7,
  primaryType: "restaurant",
  queryArea: "f-7",
  dishSlug: "chicken-karahi",
  fetchedAt: daysAgo(2, NOW).toISOString(),
  ...over,
});

async function preview(rows: CandidateRow[]) {
  const { city } = await place("islamabad", "f-7");
  return previewImport(ADMIN, { cityId: city.id, csvText: encodeCandidatesCsv(rows) }, NOW);
}

describe("/admin/import service (docs/07 §2, test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("flags duplicates by googlePlaceId, then by name trigram ≥ 0.6 in the same area", async () => {
    const linked = await makeRestaurant("Savour Foods", { googlePlaceId: "ChIJ-linked-000000" });
    await makeRestaurant("Butt Karahi");
    await makeRestaurant("Butt Karahi", { areaSlug: "g-9" }); // same name, other area: not a duplicate
    const result = await preview([
      row("linked", "Savour Foods Blue Area"),
      row("butt", "Butt Karahi & BBQ"),
      row("monal", "Monal Restaurant"),
    ]);
    const [savour, butt, monal] = result.rows;
    expect(savour).toMatchObject({
      status: "imported",
      existing: { id: linked.id, hasDish: false },
    });
    expect(butt).toMatchObject({ status: "possible_duplicate", suggestedArea: { name: "F-7" } });
    expect(
      butt?.status !== "rejected" &&
        butt?.duplicates.map((d) => [d.name, d.areaName, d.similarity]),
    ).toEqual([
      ["Butt Karahi", "F-7", 0.63], // 12 of 19 trigrams shared
    ]);
    expect(monal).toMatchObject({ status: "new", duplicates: [], existing: null });
    expect(result.counts).toEqual({ rejected: 0, new: 1, imported: 1, possible_duplicate: 1 });
  });

  it("rejects stale, unknown-dish, wrong-city and repeated rows and warns about far-away places", async () => {
    const result = await preview([
      row("old", "Old Row", { fetchedAt: daysAgo(31, NOW).toISOString() }),
      row("dish", "Unknown Dish", { dishSlug: "sushi" }),
      row("pindi", "Wrong City", { queryArea: "saddar" }),
      row("twice", "Twice"),
      row("twice", "Twice again"),
      row("lahore", "Butt Karahi Lahore", { lat: 31.38, lng: 74.31 }),
    ]);
    expect(result.rows.map((r) => r.status)).toEqual([
      "rejected",
      "rejected",
      "rejected",
      "new",
      "rejected",
      "new",
    ]);
    const reasons = result.rows.flatMap((r) => (r.status === "rejected" ? r.reasons : []));
    expect(reasons).toEqual([
      expect.stringMatching(/older than 30 days/),
      'Unknown dish "sushi"',
      expect.stringMatching(/queryArea "saddar" is not an area of Islamabad/),
      "Same Google place as line 5",
    ]);
    const far = result.rows[5];
    expect(far?.status !== "rejected" && far?.warnings[0]).toMatch(
      /km from the nearest Islamabad area/,
    );
  });

  it("previews without writing anything", async () => {
    await makeRestaurant("Butt Karahi");
    const before = await Promise.all([db.restaurant.count(), db.restaurantDish.count()]);
    await preview([row("a", "Butt Karahi"), row("b", "New Place")]);
    expect(await Promise.all([db.restaurant.count(), db.restaurantDish.count()])).toEqual(before);
  });

  it("Create saves the admin-confirmed form, googleSyncedAt = fetchedAt and a CANDIDATE dish", async () => {
    const { city, area } = await place("islamabad", "f-7");
    const csv = row("create", "BUTT KARAHI (F-7 Markaz)");
    const { restaurant, restaurantDish } = await importCreate(
      ADMIN,
      {
        name: "Butt Karahi", // typed by the admin, not the Google name
        cityId: city.id,
        areaId: area.id,
        address: "Shop 3, F-7 Markaz",
        lat: csv.lat,
        lng: csv.lng,
        googlePlaceId: csv.googlePlaceId,
        fetchedAt: csv.fetchedAt,
        phone: "03001234567",
        priceBand: 2,
        dishSlug: "chicken-karahi",
      },
      NOW,
    );
    const saved = await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } });
    expect(saved).toMatchObject({
      name: "Butt Karahi",
      slug: "butt-karahi-f-7",
      address: "Shop 3, F-7 Markaz",
      googlePlaceId: csv.googlePlaceId,
      phone: "03001234567",
      priceBand: 2,
    });
    expect(saved.googleSyncedAt?.toISOString()).toBe(csv.fetchedAt);
    expect(
      await db.restaurantDish.findUniqueOrThrow({ where: { id: restaurantDish!.id } }),
    ).toMatchObject({
      status: "CANDIDATE",
      source: "GOOGLE_SEARCH",
      confidence: 0.4,
      cityId: city.id,
    });
    // The same row again: the place is linked already.
    await expect(
      importCreate(
        ADMIN,
        {
          name: "X",
          cityId: city.id,
          areaId: area.id,
          address: "Y",
          lat: 1,
          lng: 1,
          googlePlaceId: csv.googlePlaceId,
          fetchedAt: csv.fetchedAt,
          dishSlug: "chicken-karahi",
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "PLACE_ALREADY_LINKED" });
  });

  it("Link sets the place on a restaurant without one, never on one with another place", async () => {
    const plain = await makeRestaurant("Butt Karahi", { lat: 33.7, lng: 73.0 });
    const other = await makeRestaurant("Savour Foods", { googlePlaceId: "ChIJ-other-000000" });
    const csv = row("link", "Butt Karahi", { dishSlug: "haleem" });

    const linked = await importLink(ADMIN, { restaurantId: plain.id, ...pick(csv) }, NOW);
    expect(linked).toMatchObject({
      outcome: "linked",
      placeLinked: true,
      restaurantDish: { created: true },
    });
    const saved = await db.restaurant.findUniqueOrThrow({ where: { id: plain.id } });
    expect(saved).toMatchObject({ googlePlaceId: csv.googlePlaceId, lat: csv.lat, lng: csv.lng });
    expect(saved.googleSyncedAt?.toISOString()).toBe(csv.fetchedAt);

    const refused = await importLink(
      ADMIN,
      { restaurantId: other.id, ...pick(row("x", "Savour")) },
      NOW,
    );
    expect(refused.outcome).toBe("possible_duplicate");
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({
      googlePlaceId: "ChIJ-other-000000",
    });
    expect(await db.restaurantDish.count({ where: { restaurantId: other.id } })).toBe(0);
  });

  it("Link never downgrades a stronger dish row and refuses stale rows and non-admins", async () => {
    const r = await makeRestaurant("Savour Foods", { googlePlaceId: "ChIJ-strong-000000" });
    const strong = await makeDish(r, "chicken-karahi", {
      status: "MENU_VERIFIED",
      source: "MENU_PHOTO",
      confidence: 0.95,
    });
    const csv = row("strong", "Savour Foods");
    expect(await importLink(ADMIN, { restaurantId: r.id, ...pick(csv) }, NOW)).toMatchObject({
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
        { restaurantId: r.id, ...pick(csv), fetchedAt: daysAgo(31, NOW).toISOString() },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "GOOGLE_DATA_TOO_OLD" });
    await expect(importLink(USER, { restaurantId: r.id, ...pick(csv) }, NOW)).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      },
    );
  });
});

function pick(r: CandidateRow) {
  return {
    googlePlaceId: r.googlePlaceId,
    lat: r.lat,
    lng: r.lng,
    fetchedAt: r.fetchedAt,
    dishSlug: r.dishSlug,
  };
}
