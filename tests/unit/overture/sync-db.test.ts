import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { OverturePlace } from "@/server/services/overture/places";
import {
  latestOvertureSync,
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

  it("a newer release only adds new GERS ids and never overwrites staged or reviewed rows", async () => {
    await sync([place("08f-one"), place("08f-two")], "2026-10-21.0");
    await db.overtureCandidate.update({
      where: { overtureId: "08f-one" },
      data: { status: "SKIPPED", skipReason: "CLOSED" },
    });
    const before = await row("08f-two");

    const summary = await sync(
      [
        place("08f-one", { name: "Renamed", confidence: 0.99 }),
        place("08f-two", { address: "Moved Market", lat: F7.lat + 0.01 }),
        place("08f-three"),
      ],
      "2026-11-18.0",
    );
    expect(summary.cities.islamabad).toMatchObject({
      inRelease: 3,
      inserted: 1,
      alreadyStaged: 2,
      lastSeenUpdated: 2,
    });
    expect(await row("08f-one")).toMatchObject({
      name: "Fixture 08f-one",
      confidence: 0.8,
      status: "SKIPPED",
      skipReason: "CLOSED",
      release: "2026-10-21.0",
      lastSeenRelease: "2026-11-18.0",
    });
    const after = await row("08f-two");
    expect({
      ...after,
      lastSeenRelease: before.lastSeenRelease,
      updatedAt: before.updatedAt,
    }).toEqual(before);
    expect(await row("08f-three")).toMatchObject({ release: "2026-11-18.0", status: "NEW" });

    // Re-running an older release changes nothing.
    await sync([place("08f-one")], "2026-10-21.0");
    expect((await row("08f-one")).lastSeenRelease).toBe("2026-11-18.0");
    expect(await db.overtureCandidate.count()).toBe(3);
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
