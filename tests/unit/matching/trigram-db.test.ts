import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { sqlTrigramSearch } from "@/server/services/matching/trigram";
import { inMemoryTrigram, seedAliasEntries } from "./helpers";

// Needs a seeded database. Checks that the SQL step (pg_trgm, GIN index, 0.45 threshold) returns the
// same dishes and similarities as the in-memory double used by the unit tests, on the docs/05
// "How the thresholds were chosen" inputs.
const memory = inMemoryTrigram(seedAliasEntries());
const texts = [
  "chikan kadhai",
  "beef burgar",
  "chiken karahi",
  "zingar burger",
  "shami kabab",
  "karahi",
  "gola kabab",
  "prawn karahi",
  "raita",
];

describe("SQL trigram search", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it.each(texts)("%s: same candidates as pg_trgm semantics in memory", async (text) => {
    const shape = (rows: { dishSlug: string; similarity: number }[]) =>
      rows.map((r) => `${r.dishSlug} ${r.similarity.toFixed(3)}`);
    expect(shape(await sqlTrigramSearch(text))).toEqual(shape(await memory(text)));
  });

  it("reproduces the docs/05 threshold table", async () => {
    const top = async (t: string) => (await sqlTrigramSearch(t))[0];
    expect((await top("chikan kadhai"))?.dishSlug).toBe("chicken-karahi");
    expect((await top("chikan kadhai"))?.similarity).toBeCloseTo(0.53, 2);
    expect((await top("shami kabab"))?.similarity).toBeCloseTo(0.75, 2);
    expect(await sqlTrigramSearch("gola kabab")).toEqual([]); // 0.40 < 0.45
    expect(await sqlTrigramSearch("raita")).toEqual([]);
  });
});
