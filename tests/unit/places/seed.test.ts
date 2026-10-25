import { describe, expect, it } from "vitest";
import {
  PlacesApiError,
  PlacesBudgetError,
  type PlaceCandidate,
  type PlacesClient,
  type TextSearchParams,
} from "@/server/places";
import {
  includedTypeFor,
  loadSeedTarget,
  maxCallsFor,
  planSeedQueries,
  runSeedQueries,
  type SeedTarget,
} from "@/server/services/places-seed";

const target: SeedTarget = {
  city: { slug: "islamabad", name: "Islamabad" },
  dish: { slug: "chicken-karahi", name: "Chicken Karahi", categorySlug: "karahi-handi" },
  areas: [
    { slug: "f-6", name: "F-6", lat: 33.7276, lng: 73.0821 },
    { slug: "f-7", name: "F-7", lat: 33.7215, lng: 73.0569 },
  ],
};

const place = (id: string): PlaceCandidate => ({
  googlePlaceId: id,
  displayName: `Place ${id}`,
  formattedAddress: "Islamabad",
  lat: 33.7,
  lng: 73.05,
  primaryType: "restaurant",
});

type Page = { ids: string[]; next?: string } | Error;

/** A Places client double that answers Text Search from a script per textQuery. */
function scriptedClient(pages: Record<string, Page[]>, maxCalls = Infinity) {
  let calls = 0;
  const seen: TextSearchParams[] = [];
  const client: PlacesClient = {
    get calls() {
      return calls;
    },
    async textSearch(params) {
      if (calls >= maxCalls) throw new PlacesBudgetError(calls);
      calls++;
      seen.push(params);
      const next = pages[params.textQuery]?.shift();
      if (!next) throw new Error(`unexpected query ${params.textQuery}`);
      if (next instanceof Error) throw next;
      return {
        places: next.ids.map(place),
        withoutLocation: 0,
        nextPageToken: next.next,
        fetchedAt: new Date(Date.UTC(2026, 9, 25, 10, 0, calls)),
      };
    },
    async placeDetails() {
      throw new Error("not used");
    },
  };
  return { client, seen };
}

describe("seed query plan (docs/07 §1)", () => {
  it("builds one '<dish> <area> <city>' query per area centred on the area", () => {
    const queries = planSeedQueries(target);
    expect(queries).toEqual([
      {
        areaSlug: "f-6",
        params: {
          textQuery: "Chicken Karahi F-6 Islamabad",
          includedType: "restaurant",
          center: { latitude: 33.7276, longitude: 73.0821 },
        },
      },
      {
        areaSlug: "f-7",
        params: {
          textQuery: "Chicken Karahi F-7 Islamabad",
          includedType: "restaurant",
          center: { latitude: 33.7215, longitude: 73.0569 },
        },
      },
    ]);
    expect(maxCallsFor(queries)).toBe(6);
  });

  it("searches tea, breakfast, dessert and street-food dishes without includedType", () => {
    for (const category of ["drinks", "breakfast", "desserts", "street-food"]) {
      expect(includedTypeFor(category)).toBeUndefined();
    }
    for (const category of ["karahi-handi", "bbq", "fast-food", "rice"]) {
      expect(includedTypeFor(category)).toBe("restaurant");
    }
  });

  it("loads chai and halwa-puri from the seeded DB with no type bias", async () => {
    for (const dishSlug of ["chai", "halwa-puri"]) {
      const loaded = await loadSeedTarget({ citySlug: "islamabad", dishSlug, areaSlugs: ["f-7"] });
      expect(planSeedQueries(loaded)[0]?.params.includedType).toBeUndefined();
    }
  });

  it("names unknown areas", async () => {
    await expect(
      loadSeedTarget({ citySlug: "islamabad", dishSlug: "chai", areaSlugs: ["f-7", "nowhere"] }),
    ).rejects.toThrow(/Unknown areas in islamabad: nowhere/);
  });
});

describe("seed run", () => {
  it("follows nextPageToken up to 3 pages, dedupes across areas and stamps each page's fetch time", async () => {
    const { client, seen } = scriptedClient({
      "Chicken Karahi F-6 Islamabad": [
        { ids: ["a", "b"], next: "t2" },
        { ids: ["c"], next: "t3" },
        { ids: ["d"], next: "t4" }, // a 4th page is never requested
      ],
      "Chicken Karahi F-7 Islamabad": [{ ids: ["b", "e"] }],
    });
    const run = await runSeedQueries(client, planSeedQueries(target), "chicken-karahi");
    expect(run.rows.map((r) => `${r.googlePlaceId}@${r.queryArea}`)).toEqual([
      "a@f-6",
      "b@f-6",
      "c@f-6",
      "d@f-6",
      "e@f-7",
    ]);
    expect(seen.map((p) => p.pageToken)).toEqual([undefined, "t2", "t3", undefined]);
    expect(run.rows[0]?.fetchedAt).toBe("2026-10-25T10:00:01.000Z");
    expect(run.rows[2]?.fetchedAt).toBe("2026-10-25T10:00:02.000Z");
    expect(run.areas.map((a) => [a.areaSlug, a.pages, a.results, a.newPlaces])).toEqual([
      ["f-6", 3, 4, 4],
      ["f-7", 1, 2, 1],
    ]);
    expect(run.calls).toBe(4);
    expect(run.stoppedEarly).toBeUndefined();
  });

  it("stops at the call budget and keeps what it has", async () => {
    const { client } = scriptedClient(
      { "Chicken Karahi F-6 Islamabad": [{ ids: ["a"], next: "t2" }, { ids: ["b"] }] },
      1,
    );
    const run = await runSeedQueries(client, planSeedQueries(target), "chicken-karahi");
    expect(run.rows.map((r) => r.googlePlaceId)).toEqual(["a"]);
    expect(run.stoppedEarly).toBe("call budget reached after 1 calls");
    expect(run.notSearched).toEqual(["f-7"]);
  });

  it("stops at a page-1 client error (bad key, disabled API) instead of failing every area", async () => {
    const { client } = scriptedClient({
      "Chicken Karahi F-6 Islamabad": [
        new PlacesApiError(403, "PERMISSION_DENIED", "API key not valid"),
      ],
    });
    const run = await runSeedQueries(client, planSeedQueries(target), "chicken-karahi");
    expect(run.stoppedEarly).toBe("Google answered 403 PERMISSION_DENIED: API key not valid");
    expect(run.notSearched).toEqual(["f-7"]);
  });

  it("keeps going after a later-page error in one area", async () => {
    const { client } = scriptedClient({
      "Chicken Karahi F-6 Islamabad": [
        { ids: ["a"], next: "t2" },
        new PlacesApiError(400, "INVALID_ARGUMENT", "Invalid page token"),
      ],
      "Chicken Karahi F-7 Islamabad": [{ ids: ["e"] }],
    });
    const run = await runSeedQueries(client, planSeedQueries(target), "chicken-karahi");
    expect(run.rows.map((r) => r.googlePlaceId)).toEqual(["a", "e"]);
    expect(run.areas[0]?.error).toBe("400 INVALID_ARGUMENT: Invalid page token");
    expect(run.stoppedEarly).toBeUndefined();
  });
});
