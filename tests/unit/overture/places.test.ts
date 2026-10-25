import { describe, expect, it } from "vitest";
import {
  buildCandidates,
  compareReleases,
  hasOpenSources,
  isFoodAndDrink,
  isGoogleLink,
  pickPhone,
  pickWebsite,
  placeholderPoints,
  stripGoogleLinks,
  type OverturePlace,
  type SeedArea,
} from "@/server/services/overture/places";

const F7 = { lat: 33.7215, lng: 73.0569 };
const AREAS: SeedArea[] = [
  { id: "area-f7", cityId: "city-isb", citySlug: "islamabad", ...F7 },
  { id: "area-saddar", cityId: "city-rwp", citySlug: "rawalpindi", lat: 33.597, lng: 73.0516 },
];
const KM_NORTH = 1 / 111.2; // degrees of latitude per km

let n = 0;
/** A made-up Overture place: a Meta restaurant in F-7 unless `over` says otherwise. */
function place(over: Partial<OverturePlace> = {}): OverturePlace {
  n++;
  return {
    id: `08f-fixture-${n}`,
    name: `Fixture Place ${n}`,
    ...F7,
    confidence: 0.8,
    operatingStatus: null,
    category: "restaurant",
    alternates: [],
    hierarchy: ["food_and_drink", "restaurant"],
    sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }],
    address: `Shop ${n}, Fixture Market`,
    locality: "Islamabad",
    phones: [],
    websites: [],
    ...over,
  };
}

describe("Overture filters (docs/07 §1)", () => {
  it("keeps food and drink, without the alcohol branch", () => {
    expect(isFoodAndDrink(["food_and_drink", "restaurant", "pizza_restaurant"])).toBe(true);
    expect(isFoodAndDrink(["food_and_drink", "alcoholic_beverage_venue", "bar"])).toBe(false);
    expect(isFoodAndDrink(["shopping", "food_and_drink"])).toBe(false);
    expect(isFoodAndDrink([])).toBe(false);
  });

  it("keeps only records whose every source is Meta or Microsoft under CDLA Permissive 2.0", () => {
    const cdla = "CDLA-Permissive-2.0";
    expect(hasOpenSources([{ dataset: "meta", license: cdla }])).toBe(true);
    expect(hasOpenSources([{ dataset: "Microsoft", license: cdla }])).toBe(true);
    expect(hasOpenSources([{ dataset: "Foursquare", license: "Apache-2.0" }])).toBe(false);
    expect(hasOpenSources([{ dataset: "AllThePlaces", license: "CC0-1.0" }])).toBe(false);
    expect(
      hasOpenSources([
        { dataset: "meta", license: cdla },
        { dataset: "Foursquare", license: "Apache-2.0" },
      ]),
    ).toBe(false);
    expect(hasOpenSources([{ dataset: "meta", license: "CC-BY-4.0" }])).toBe(false);
    expect(hasOpenSources([])).toBe(false);
  });

  it("builds candidates only from food places of the two datasets and counts what it left out", () => {
    const places = [
      place({ name: "Fixture Meta Karahi" }),
      place({
        name: "Fixture Microsoft Cafe",
        sources: [{ dataset: "Microsoft", license: "CDLA-Permissive-2.0" }],
      }),
      place({ sources: [{ dataset: "Foursquare", license: "Apache-2.0" }] }),
      place({ sources: [{ dataset: "AllThePlaces", license: "CC0-1.0" }] }),
      place({ hierarchy: ["shopping", "clothing_store"] }),
      place({ hierarchy: ["food_and_drink", "alcoholic_beverage_venue", "bar"] }),
      place({ name: "   " }),
      place({ operatingStatus: "permanently_closed" }),
    ];
    const { drafts, stats } = buildCandidates(places, AREAS);
    expect(drafts.map((d) => d.name)).toEqual(["Fixture Meta Karahi", "Fixture Microsoft Cafe"]);
    expect(drafts[1].sources).toEqual(["Microsoft"]);
    expect(stats).toMatchObject({
      places: 8,
      food: 6,
      otherSources: { Foursquare: 1, AllThePlaces: 1 },
      noName: 1,
      closed: 1,
      kept: 2,
    });
  });

  it("suggests the nearest seed area within 1.5 km; farther out only the city; beyond the margin nothing", () => {
    const near = place({ lat: F7.lat + 0.5 * KM_NORTH });
    const far = place({ lat: F7.lat + 3 * KM_NORTH });
    const outside = place({ lat: F7.lat + 6 * KM_NORTH });
    const pindi = place({ lat: 33.5975, lng: 73.0516 });
    const { drafts, stats } = buildCandidates([near, far, outside, pindi], AREAS, 5);
    expect(drafts.map((d) => [d.overtureId, d.citySlug, d.suggestedAreaId])).toEqual([
      [near.id, "islamabad", "area-f7"],
      [far.id, "islamabad", null],
      [pindi.id, "rawalpindi", "area-saddar"],
    ]);
    expect(drafts[1]).toMatchObject({ lat: far.lat, lng: far.lng, cityId: "city-isb" });
    expect(stats.outside).toBe(1);
    expect(buildCandidates([outside], AREAS, 10).drafts).toHaveLength(1);
  });

  it("treats places on a placeholder point as location unknown: no coordinates, no area, the point's city", () => {
    const point = { lat: 33.7059, lng: 73.0717 }; // a geocoder fallback in G-7
    const crowd = Array.from({ length: 11 }, (_, i) =>
      place({ ...point, hierarchy: ["shopping"], address: `Plot ${i}, Somewhere` }),
    );
    const food = place({ ...point, name: "Fixture Fallback Tikka" });
    // A real building: many places on one point, but the same address (a food court).
    const court = Array.from({ length: 12 }, () =>
      place({ lat: 33.7, lng: 73.06, address: "Fixture Mall, Food Court" }),
    );
    expect(placeholderPoints([...crowd, food, ...court])).toEqual(new Set(["33.7059,73.0717"]));
    const { drafts, stats } = buildCandidates([...crowd, food, ...court], AREAS);
    const fallback = drafts.find((d) => d.name === "Fixture Fallback Tikka")!;
    expect(fallback).toMatchObject({
      lat: null,
      lng: null,
      suggestedAreaId: null,
      citySlug: "islamabad",
    });
    expect(drafts.filter((d) => d.lat !== null)).toHaveLength(12); // the food court keeps its point
    expect(stats.locationUnknown).toBe(1);
  });

  it("strips Google links from the address and websites", () => {
    expect(isGoogleLink("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(isGoogleLink("https://www.google.com/maps/place/Fixture/@33.7,73.0,17z")).toBe(true);
    expect(isGoogleLink("http://maps.google.com.pk/?cid=123")).toBe(true);
    expect(isGoogleLink("goo.gl/maps/xyz")).toBe(true);
    expect(isGoogleLink("g.page/fixture-grill")).toBe(true);
    expect(isGoogleLink("share.google/AbCdEf")).toBe(true);
    expect(isGoogleLink("(https://maps.app.goo.gl/x),")).toBe(true);
    expect(isGoogleLink("G.Co.")).toBe(false); // a word, not a link
    expect(isGoogleLink("https://fixture-grill.example/menu")).toBe(false);
    expect(isGoogleLink("https://www.facebook.com/fixturegrill")).toBe(false);

    expect(stripGoogleLinks("Shop 4, Jinnah Super https://maps.app.goo.gl/AbC123")).toBe(
      "Shop 4, Jinnah Super",
    );
    expect(stripGoogleLinks("https://maps.app.goo.gl/AbC123, Islamabad")).toBe("Islamabad");
    expect(stripGoogleLinks("https://goo.gl/maps/xyz")).toBeNull();
    expect(stripGoogleLinks("Plot 7,  F-7 Markaz ")).toBe("Plot 7, F-7 Markaz"); // spaces only
    // A literal "\n" escape glued to the link, as in one real record.
    expect(stripGoogleLinks("Fixture Arcade\\nhttps://maps.app.goo.gl/AbC123")).toBe(
      "Fixture Arcade",
    );
    expect(stripGoogleLinks("Fixture Arcadehttps://maps.app.goo.gl/AbC123")).toBe("Fixture Arcade");
    expect(
      pickWebsite([
        "https://www.google.com/maps/place/x",
        "fixture.example",
        "https://fixture-cafe.example",
      ]),
    ).toBe("https://fixture-cafe.example");
    expect(pickWebsite(["https://g.page/fixture"])).toBeNull();

    const { drafts, stats } = buildCandidates(
      [
        place({
          address: "Shop 4, Jinnah Super https://maps.app.goo.gl/AbC123",
          websites: ["https://maps.app.goo.gl/AbC123", "https://www.facebook.com/fixture"],
        }),
        place({ address: "https://goo.gl/maps/xyz" }),
        place({ address: "Plot 9, Fixture Market" }),
      ],
      AREAS,
    );
    expect(drafts.map((d) => [d.address, d.website])).toEqual([
      ["Shop 4, Jinnah Super", "https://www.facebook.com/fixture"],
      [null, null],
      ["Plot 9, Fixture Market", null],
    ]);
    expect(stats.googleLinksRemoved).toBe(2);
    expect(JSON.stringify(drafts)).not.toMatch(/goo\.gl|google\./);
  });

  it("keeps the first phone number our form accepts, normalised", () => {
    expect(pickPhone(["(051) 2345678"])).toBe("0512345678");
    expect(pickPhone(["n/a", "+92 300 1234567"])).toBe("+923001234567");
    expect(pickPhone(["12"])).toBeNull();
  });

  it("orders releases by date, then by counter", () => {
    expect(compareReleases("2026-10-21.0", "2026-11-18.0")).toBeLessThan(0);
    expect(compareReleases("2026-10-21.10", "2026-10-21.9")).toBeGreaterThan(0);
    expect(compareReleases("2026-10-21.0", "2026-10-21.0")).toBe(0);
  });
});
