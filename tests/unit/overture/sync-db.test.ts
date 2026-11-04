import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { OverturePlace } from "@/server/services/overture/places";
import {
  latestOvertureSync,
  replaceAreaSuggestions,
  syncOvertureCandidates,
} from "@/server/services/overture-sync.service";
import { resetAppData } from "../../setup/db-reset";
import { place as seedPlace } from "../restaurants/fixtures";

const F7 = { lat: 33.7215, lng: 73.0569 }; // seed/areas.json
const SADDAR = { lat: 33.597, lng: 73.0516 };

/** A made-up Overture food place from Meta, in F-7 unless `over` says otherwise. */
function place(id: string, over: Partial<OverturePlace> = {}): OverturePlace {
  return {
    id,
    name: `Fixture ${id}`,
    ...F7,
    confidence: 0.8,
    operatingStatus: null,
    category: "restaurant",
    alternates: [],
    hierarchy: ["food_and_drink", "restaurant"],
    sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }],
    address: `Shop 1, ${id} Market`,
    locality: "Islamabad",
    phones: ["051 1234567"],
    websites: [],
    ...over,
  };
}

const sync = (places: OverturePlace[], release: string, citySlugs = ["islamabad", "rawalpindi"]) =>
  syncOvertureCandidates({ places, release, citySlugs, marginKm: 5 });

const row = (overtureId: string) =>
  db.overtureCandidate.findUniqueOrThrow({ where: { overtureId } });

describe("pnpm overture:sync (test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("stages the chosen cities' Meta and Microsoft food places and records the run", async () => {
    const summary = await sync(
      [
        place("08f-isb", { websites: ["https://maps.app.goo.gl/x", "https://fixture.example"] }),
        place("08f-rwp", { ...SADDAR }),
        place("08f-fsq", { sources: [{ dataset: "Foursquare", license: "Apache-2.0" }] }),
        place("08f-shop", { hierarchy: ["shopping"] }),
      ],
      "2026-10-21.0",
      ["islamabad"],
    );
    expect(Object.keys(summary.cities)).toEqual(["islamabad"]);
    expect(summary.cities.islamabad).toMatchObject({ inRelease: 1, inserted: 1, withArea: 1 });
    expect(summary.filters.otherSources).toEqual({ Foursquare: 1 });

    const { area } = await seedPlace("islamabad", "f-7");
    expect(await row("08f-isb")).toMatchObject({
      cityId: area.cityId,
      suggestedAreaId: area.id,
      release: "2026-10-21.0",
      lastSeenRelease: "2026-10-21.0",
      status: "NEW",
      name: "Fixture 08f-isb",
      phone: "0511234567",
      website: "https://fixture.example",
      lat: F7.lat,
      lng: F7.lng,
      sources: ["meta"],
    });
    expect(await db.overtureCandidate.count()).toBe(1);
    expect(await db.restaurant.count()).toBe(0); // staging only
    const [run] = await db.jobRun.findMany({ where: { name: "overture-sync" } });
    expect(run).toMatchObject({ ok: true, summary: { release: "2026-10-21.0" } });
  });

  it("a newer release refreshes NEW candidates and never changes reviewed ones", async () => {
    await sync([place("08f-one"), place("08f-two"), place("08f-same")], "2026-10-21.0");
    await db.overtureCandidate.update({
      where: { overtureId: "08f-one" },
      data: { status: "SKIPPED", skipReason: "CLOSED" },
    });
    const same = await row("08f-same");

    const summary = await sync(
      [
        place("08f-one", { name: "Renamed", confidence: 0.99 }),
        place("08f-two", {
          name: "Two Renamed",
          address: "Moved Market",
          phones: ["051 7654321"],
          websites: ["https://two.example"],
          category: "pakistani_restaurant",
          alternates: ["bbq_restaurant"],
          lat: SADDAR.lat,
          lng: SADDAR.lng,
        }),
        place("08f-same"),
        place("08f-three"),
      ],
      "2026-11-18.0",
    );
    expect(summary.cities.islamabad).toMatchObject({
      inRelease: 3,
      inserted: 1,
      alreadyStaged: 2,
      refreshed: 0,
    });
    // 08f-two moved to Saddar: refreshed under its new city.
    expect(summary.cities.rawalpindi).toMatchObject({
      inRelease: 1,
      alreadyStaged: 1,
      refreshed: 1,
    });

    // Reviewed: only lastSeenRelease moves.
    expect(await row("08f-one")).toMatchObject({
      name: "Fixture 08f-one",
      confidence: 0.8,
      status: "SKIPPED",
      skipReason: "CLOSED",
      release: "2026-10-21.0",
      lastSeenRelease: "2026-11-18.0",
    });
    // NEW: name, address, phone, website, location and categories come from the newer release.
    const saddar = await seedPlace("rawalpindi", "saddar");
    expect(await row("08f-two")).toMatchObject({
      name: "Two Renamed",
      address: "Moved Market",
      phone: "0517654321",
      website: "https://two.example",
      category: "pakistani_restaurant",
      alternates: ["bbq_restaurant"],
      lat: SADDAR.lat,
      lng: SADDAR.lng,
      cityId: saddar.city.id,
      suggestedAreaId: saddar.area.id,
      release: "2026-11-18.0",
      lastSeenRelease: "2026-11-18.0",
      status: "NEW",
    });
    // NEW and unchanged: only lastSeenRelease.
    expect({
      ...(await row("08f-same")),
      lastSeenRelease: same.lastSeenRelease,
      updatedAt: same.updatedAt,
    }).toEqual(same);
    expect(await row("08f-three")).toMatchObject({ release: "2026-11-18.0", status: "NEW" });

    // Re-running an older release changes nothing.
    await sync([place("08f-two", { name: "Old name" })], "2026-10-21.0");
    expect(await row("08f-two")).toMatchObject({
      name: "Two Renamed",
      lastSeenRelease: "2026-11-18.0",
    });
    expect(await db.overtureCandidate.count()).toBe(4);
  });

  it("--areas-only places NEW candidates again with each area's radius; reviewed rows stay", async () => {
    // 2.8 km from the Bahria Town (Islamabad) centre: outside 1.5 km, inside its 3.5 km radius.
    const bahria = { lat: 33.5225 - 2.8 / 111.2, lng: 73.1081 };
    await sync([place("08f-bahria", bahria), place("08f-reviewed", bahria)], "2026-10-21.0");
    // As staged before areas had their own radius: no suggestion.
    await db.overtureCandidate.updateMany({ data: { suggestedAreaId: null } });
    await db.overtureCandidate.update({
      where: { overtureId: "08f-reviewed" },
      data: { status: "SKIPPED" },
    });
    const summary = await replaceAreaSuggestions({ citySlugs: ["islamabad", "rawalpindi"] });
    const isb = await seedPlace("islamabad", "bahria-town-isb");
    expect((await row("08f-bahria")).suggestedAreaId).toBe(isb.area.id);
    expect((await row("08f-reviewed")).suggestedAreaId).toBeNull();
    expect(summary.islamabad).toMatchObject({ located: 1, withArea: 1, changed: 1 });
  });

  it("refuses an unknown city and records the failed run", async () => {
    await expect(sync([place("08f-x")], "2026-10-21.0", ["lahore"])).rejects.toThrow(
      "unknown city: lahore",
    );
    const [run] = await db.jobRun.findMany({ where: { name: "overture-sync" } });
    expect(run.ok).toBe(false);
  });

  it("reports the newest synced release, accessed on the day it was first synced", async () => {
    const at = (iso: string) => new Date(iso);
    await db.jobRun.createMany({
      data: [
        {
          name: "overture-sync",
          ok: true,
          startedAt: at("2026-10-25T10:00:00Z"),
          summary: { release: "2026-10-21.0" },
        },
        {
          name: "overture-sync",
          ok: true,
          startedAt: at("2026-11-20T20:30:00Z"),
          summary: { release: "2026-11-18.0" },
        },
        {
          name: "overture-sync",
          ok: true,
          startedAt: at("2026-11-25T08:00:00Z"),
          summary: { release: "2026-11-18.0" },
        },
        {
          name: "overture-sync",
          ok: false,
          startedAt: at("2026-12-01T08:00:00Z"),
          summary: { release: "2026-12-01.0" },
        },
      ],
    });
    // 20:30 UTC is 01:30 the next day in Karachi.
    expect(await latestOvertureSync()).toEqual({
      release: "2026-11-18.0",
      firstSyncedOn: "2026-11-21",
    });
  });
});
