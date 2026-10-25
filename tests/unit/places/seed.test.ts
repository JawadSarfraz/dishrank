import { describe, expect, it } from "vitest";
import { PlacesApiError } from "@/server/places";
import { SEARCH_BOX_HALF_SIZE_KM, includedTypeFor } from "@/server/services/places-query";
import {
  loadSeedTarget,
  maxCallsFor,
  planSeedQueries,
  runPlanningQueries,
  runSeedPlaces,
  type SeedTarget,
} from "@/server/services/places-seed";
import { fakePlace, scriptedPlaces } from "./fake-places";

const target: SeedTarget = {
  city: { slug: "islamabad", name: "Islamabad" },
  dish: { slug: "chicken-karahi", name: "Chicken Karahi", categorySlug: "karahi-handi" },
  areas: [
    { slug: "f-6", name: "F-6", lat: 33.7276, lng: 73.0821 },
    { slug: "f-7", name: "F-7", lat: 33.7215, lng: 73.0569 },
  ],
};

describe("seed query plan (docs/07 §1)", () => {
  it("builds the live-import query per area, restricted to a box around the area centre", () => {
    const queries = planSeedQueries(target);
    expect(queries.map((q) => [q.areaSlug, q.params.textQuery, q.params.includedType])).toEqual([
      ["f-6", "Chicken Karahi F-6 Islamabad", "restaurant"],
      ["f-7", "Chicken Karahi F-7 Islamabad", "restaurant"],
    ]);
    const { low, high } = queries[1]!.params.restriction;
    expect(low.lat).toBeLessThan(33.7215);
    expect(high.lat).toBeGreaterThan(33.7215);
    expect(low.lng).toBeLessThan(73.0569);
    expect(high.lng).toBeGreaterThan(73.0569);
    expect((high.lat - low.lat) * 110.574).toBeCloseTo(2 * SEARCH_BOX_HALF_SIZE_KM, 3);
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

describe("planning run (ids only)", () => {
  it("follows nextPageToken up to 3 pages and counts unique places across areas", async () => {
    const { client, seen } = scriptedPlaces({
      "Chicken Karahi F-6 Islamabad": [
        { places: [fakePlace("a"), fakePlace("b")], next: "t2" },
        { places: [fakePlace("c")], next: "t3" },
        { places: [fakePlace("d")], next: "t4" }, // a 4th page is never requested
      ],
      "Chicken Karahi F-7 Islamabad": [{ places: [fakePlace("b"), fakePlace("e")] }],
    });
    const run = await runPlanningQueries(client, planSeedQueries(target));
    expect(seen.map((p) => p.pageToken)).toEqual([undefined, "t2", "t3", undefined]);
    expect(run.areas.map((a) => [a.areaSlug, a.pages, a.results, a.newPlaces])).toEqual([
      ["f-6", 3, 4, 4],
      ["f-7", 1, 2, 1],
    ]);
    expect(run).toMatchObject({ uniquePlaces: 5, calls: 4, stoppedEarly: undefined });
  });

  it("stops at the call budget", async () => {
    const { client } = scriptedPlaces(
      { "Chicken Karahi F-6 Islamabad": [{ places: [fakePlace("a")], next: "t2" }] },
      1,
    );
    const run = await runPlanningQueries(client, planSeedQueries(target));
    expect(run.stoppedEarly).toBe("call budget reached after 1 calls");
    expect(run.notSearched).toEqual(["f-7"]);
  });

  it("stops at a page-1 client error (bad key, disabled API) instead of failing every area", async () => {
    const { client } = scriptedPlaces({
      "Chicken Karahi F-6 Islamabad": [
        new PlacesApiError(403, "PERMISSION_DENIED", "API key not valid"),
      ],
    });
    const run = await runPlanningQueries(client, planSeedQueries(target));
    expect(run.stoppedEarly).toBe("Google answered 403 PERMISSION_DENIED");
    expect(run.notSearched).toEqual(["f-7"]);
  });

  it("keeps going after a later-page error in one area", async () => {
    const { client } = scriptedPlaces({
      "Chicken Karahi F-6 Islamabad": [
        { places: [fakePlace("a")], next: "t2" },
        new PlacesApiError(400, "INVALID_ARGUMENT", "Invalid page token"),
      ],
      "Chicken Karahi F-7 Islamabad": [{ places: [fakePlace("e")] }],
    });
    const run = await runPlanningQueries(client, planSeedQueries(target));
    expect(run.uniquePlaces).toBe(2);
    expect(run.areas[0]?.error).toBe("400 INVALID_ARGUMENT: Invalid page token");
    expect(run.stoppedEarly).toBeUndefined();
  });
});

describe("pnpm seed:places (planning tool)", () => {
  function sink() {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, print: (l: string) => out.push(l), printError: (l: string) => err.push(l) };
  }

  it("--dry-run makes no call and prints the plan", async () => {
    const io = sink();
    const code = await runSeedPlaces(
      ["--", "--city=islamabad", "--dish=chicken-karahi", "--areas=f-7", "--dry-run"],
      {
        ...io,
        createClient: () => {
          throw new Error("a dry run must not create a Places client");
        },
      },
    );
    expect(code).toBe(0);
    expect(io.out.join("\n")).toMatch(/DRY RUN: no Google calls/);
    expect(io.out.join("\n")).toMatch(/"Chicken Karahi F-7 Islamabad"/);
  });

  it("refuses to run without an API key", async () => {
    const io = sink();
    const code = await runSeedPlaces(["--city=islamabad", "--dish=chai", "--areas=f-7"], {
      ...io,
      createClient: () => null,
    });
    expect(code).toBe(1);
    expect(io.err.join("\n")).toMatch(/GOOGLE_PLACES_API_KEY is not set/);
  });

  it("prints counts and the live-import estimate, never a name or address", async () => {
    const io = sink();
    const { client } = scriptedPlaces({
      "Chicken Karahi F-7 Islamabad": [
        { places: [fakePlace("a"), fakePlace("b")], next: "t2" },
        { places: [fakePlace("c")] },
      ],
    });
    const code = await runSeedPlaces(["--city=islamabad", "--dish=chicken-karahi", "--areas=f-7"], {
      ...io,
      createClient: () => client,
    });
    const output = [...io.out, ...io.err].join("\n");
    expect(code).toBe(0);
    expect(output).toMatch(/f-7 +2 pages +3 results +3 new/);
    expect(output).toMatch(/live import estimate: 2 Text Search Pro calls/);
    expect(output).toMatch(/No file written/);
    expect(output).not.toMatch(/Fixture Place|Fixture Road/);
  });

  it("explains bad arguments", async () => {
    const io = sink();
    expect(await runSeedPlaces(["--dish=chai"], { ...io, createClient: () => null })).toBe(1);
    expect(io.err.join("\n")).toMatch(/--city and --dish are required slugs/);
  });
});
