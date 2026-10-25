// Guard (CLAUDE.md rule 2, Maps Platform Terms 3.2.3): Google names, addresses, data-provider
// credits and error text never reach a DB write, a file or a log. The real Places client runs
// against a fake fetch whose answers carry canary strings; every import, refresh and planning flow
// then runs (success and error paths), and the whole test database, every console/stdout/stderr
// line and every fs write are searched for the canary.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { createPlacesClient } from "@/server/places";
import {
  importCreate,
  importLink,
  searchPlacesForImport,
  type ImportSearchResult,
} from "@/server/services/import.service";
import { refreshPlaces } from "@/server/services/places-refresh.service";
import { runSeedPlaces } from "@/server/services/places-seed";
import { resetAppData } from "../../setup/db-reset";
import { googleError, jsonResponse } from "../places/fake-fetch";
import { ADMIN, daysAgo, makeRestaurant, place } from "../restaurants/fixtures";

const CANARY = "zqcanary"; // made up; appears in every fake Google name, address, credit and error
const NAME_A = `Tikka Point ${CANARY}`;
const NAME_B = `Fixture Karahi Tikka Grill ${CANARY}`; // ≥ 0.6 like our "Fixture Karahi Tikka Grill"
const ADDRESS_A = `7 ${CANARY} Lane, Test Sector`;
const ADDRESS_B = `Unit 9, ${CANARY} Arcade`;
const PROVIDER = `${CANARY} Data Provider`;
const ERROR_TEXT = `${CANARY} error detail`;
const NOW = new Date();

const googlePlace = (id: string, name: string, address: string, located = true) => ({
  id,
  displayName: { text: name, languageCode: "en" },
  formattedAddress: address,
  ...(located ? { location: { latitude: 33.7213, longitude: 73.0571 } } : {}),
  attributions: [{ provider: PROVIDER, providerUri: `https://${CANARY}.example` }],
});
const PAGE_1 = {
  places: [
    googlePlace("ChIJguard0001", NAME_A, ADDRESS_A),
    googlePlace("ChIJguard0002", NAME_B, ADDRESS_B),
  ],
  nextPageToken: "guardtoken2",
};
const PAGE_2 = {
  places: [
    googlePlace("ChIJguard0003", `${NAME_A} Two`, ADDRESS_B),
    googlePlace("ChIJguard0004", `${NAME_B} Three`, ADDRESS_A),
    googlePlace("ChIJguard0005", `${NAME_A} Nowhere`, ADDRESS_A, false),
  ],
};

/** Google stand-in: canary-filled pages; errors with canary text for G-9 searches and two place ids. */
async function fakeGoogle(input: string | URL | Request, init?: RequestInit) {
  const url = String(input);
  if (url.endsWith("/places:searchText")) {
    const body = JSON.parse(String(init?.body)) as { textQuery: string; pageToken?: string };
    if (body.textQuery.includes("G-9")) return googleError(403, "PERMISSION_DENIED", ERROR_TEXT);
    // The same canary JSON whatever the field mask asks for, as if Google sent extra fields.
    return jsonResponse(200, body.pageToken ? PAGE_2 : PAGE_1);
  }
  if (url.endsWith("/ChIJguardgone")) return googleError(404, "NOT_FOUND", ERROR_TEXT);
  if (url.endsWith("/ChIJguardflaky")) return googleError(503, "UNAVAILABLE", ERROR_TEXT);
  throw new Error(`unexpected request ${url}`);
}

const places = (maxCalls?: number) =>
  createPlacesClient({
    apiKey: "guard-key-not-real",
    fetch: fakeGoogle,
    sleep: async () => {},
    maxCalls,
  });

/** Every row of every table in the test database, as JSON text. */
async function dumpDatabase(): Promise<string> {
  const tables = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
  const parts: string[] = [];
  for (const { table_name } of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table_name)) throw new Error(`odd table ${table_name}`);
    const rows = await db.$queryRawUnsafe<{ row: string }[]>(
      `SELECT row_to_json(t)::text AS row FROM "${table_name}" t`,
    );
    parts.push(...rows.map((r) => r.row));
  }
  return parts.join("\n");
}

/** Captures console, stdout and stderr, and records every fs write, while `fn` runs. */
async function capture(fn: () => Promise<void>) {
  const output: string[] = [];
  const text = (args: unknown[]) =>
    args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  const spies: { mockRestore(): void }[] = [];
  for (const method of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    spies.push(
      vi.spyOn(console, method).mockImplementation((...args) => void output.push(text(args))),
    );
  }
  for (const stream of [process.stdout, process.stderr]) {
    spies.push(
      vi.spyOn(stream, "write").mockImplementation(((chunk: unknown) => {
        output.push(String(chunk));
        return true;
      }) as typeof stream.write),
    );
  }
  const writes = [
    vi.spyOn(fs, "writeFileSync"),
    vi.spyOn(fs, "appendFileSync"),
    vi.spyOn(fs, "writeFile"),
    vi.spyOn(fs, "appendFile"),
    vi.spyOn(fs, "createWriteStream"),
    vi.spyOn(fs.promises, "writeFile"),
    vi.spyOn(fs.promises, "appendFile"),
  ];
  syncBuiltinESMExports(); // named `import { writeFileSync } from "node:fs"` now hits the spies
  try {
    await fn();
  } finally {
    for (const spy of [...spies, ...writes]) spy.mockRestore();
    syncBuiltinESMExports();
  }
  const fileWrites = writes.flatMap((spy) => spy.mock.calls.map((call) => text(call)));
  return { output: output.join("\n"), fileWrites };
}

describe("Google data never reaches the DB, files or logs (test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("search, Load more, Create, Link, refresh and the planning tool keep Google text in memory only", async () => {
    const { city, area } = await place("islamabad", "f-7");
    const { area: g9 } = await place("islamabad", "g-9");
    const linked = await makeRestaurant("Fixture Pulao House", { googlePlaceId: "ChIJguard0001" });
    const plain = await makeRestaurant("Fixture Karahi Tikka Grill");
    await makeRestaurant("Fixture Gone Grill", {
      googlePlaceId: "ChIJguardgone",
      googleSyncedAt: daysAgo(26, NOW),
      lat: 33.7,
      lng: 73.05,
    });
    await makeRestaurant("Fixture Flaky Grill", {
      googlePlaceId: "ChIJguardflaky",
      googleSyncedAt: daysAgo(28.5, NOW),
      lat: 33.7,
      lng: 73.05,
    });

    const seenInMemory: string[] = [];
    const codes: number[] = [];
    const { output, fileWrites } = await capture(async () => {
      const client = places();
      const input = { dishSlug: "chicken-karahi", areaId: area.id };
      const ref = (r: ImportSearchResult | undefined, fetchedAt: string) => ({
        googlePlaceId: r!.googlePlaceId,
        lat: r!.lat!,
        lng: r!.lng!,
        fetchedAt,
        dishSlug: "chicken-karahi",
      });
      const typed = (n: number) => ({
        name: `Guard Typed Name ${n}`, // the admin types these (CLAUDE.md rule 2)
        address: `Guard Typed Address ${n}`,
        cityId: city.id,
        areaId: area.id,
      });

      // Page 1, then a Create from it while it is the latest page.
      const first = await searchPlacesForImport(ADMIN, input, client);
      expect(first.results.map((r) => r.status)).toEqual(["imported", "possible_duplicate"]);
      await importCreate(ADMIN, { ...ref(first.results[1], first.fetchedAt), ...typed(1) }, NOW);
      await importLink(
        ADMIN,
        { restaurantId: linked.id, ...ref(first.results[0], first.fetchedAt) },
        NOW,
      );

      // Load more, then a Create and a Link from page 2 while it is the latest page.
      const second = await searchPlacesForImport(
        ADMIN,
        { ...input, pageToken: first.nextPageToken! },
        client,
      );
      expect(second.results.map((r) => r.status)).toContain("no_location");
      await importCreate(ADMIN, { ...ref(second.results[1], second.fetchedAt), ...typed(2) }, NOW);
      await importLink(
        ADMIN,
        { restaurantId: plain.id, ...ref(second.results[0], second.fetchedAt) },
        NOW,
      );
      seenInMemory.push(JSON.stringify([first, second]));

      // Error paths: a live search Google refuses, then the refresh job and the planning tool.
      await expect(
        searchPlacesForImport(ADMIN, { ...input, areaId: g9.id }, client),
      ).rejects.toMatchObject({ code: "PLACES_ERROR" });
      await refreshPlaces({ places: client, now: () => NOW });
      for (const areas of ["f-7", "g-9"]) {
        codes.push(
          await runSeedPlaces(["--city=islamabad", "--dish=chicken-karahi", `--areas=${areas}`], {
            print: (line) => console.log(line),
            printError: (line) => console.error(line),
            createClient: (maxCalls) => places(maxCalls),
          }),
        );
      }
    });

    // The canaries really were there to leak: the admin's screen gets Google's text.
    for (const canary of [NAME_A, NAME_B, ADDRESS_A, ADDRESS_B, PROVIDER]) {
      expect(seenInMemory.join()).toContain(canary);
    }
    expect(codes).toEqual([0, 1]); // the planning tool's g-9 run met the Google error
    // …and none of them was saved, written or logged.
    const database = await dumpDatabase();
    expect(database).toContain("Guard Typed Name 2");
    expect(database).toContain("ChIJguard0004"); // place ids may be stored
    expect(database.toLowerCase()).not.toContain(CANARY);
    expect(output).toContain("import.search"); // logs did run
    expect(output).toContain("403 PERMISSION_DENIED"); // error status codes are fine
    expect(output.toLowerCase()).not.toContain(CANARY);
    for (const write of fileWrites) expect(write.toLowerCase()).not.toContain(CANARY);
    const tmp = path.join(process.cwd(), "tmp");
    for (const file of fs.existsSync(tmp) ? fs.readdirSync(tmp) : []) {
      expect(fs.readFileSync(path.join(tmp, file), "utf8").toLowerCase()).not.toContain(CANARY);
    }
  });
});
