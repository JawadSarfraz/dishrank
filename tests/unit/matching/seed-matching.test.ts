import { describe, expect, it } from "vitest";
import { matchDish } from "@/server/services/matching";
import { memoryDeps, seedAliasEntries } from "./helpers";

// docs/05 seed test: every dish name and every alias matches its own dish at 1.0.
describe("every seeded spelling matches its own dish at 1.0", () => {
  const entries = seedAliasEntries();

  it(`covers all ${entries.length} spellings`, async () => {
    const failures: string[] = [];
    for (const e of entries) {
      const r = await matchDish(e.alias, {}, memoryDeps());
      if (r.dishSlug !== e.dishSlug || r.confidence !== 1 || r.method !== "ALIAS") {
        failures.push(
          `${e.alias} → ${r.dishSlug ?? "none"} ${r.method} ${r.confidence} (expected ${e.dishSlug})`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("dish names (with punctuation) normalise to their own dish too", async () => {
    for (const raw of [
      "Chai (Doodh Patti)",
      "Kabab Paratha Roll",
      "Hot and Sour Soup",
      "Chilli Dry",
      "Namkeen Gosht",
    ]) {
      const r = await matchDish(raw, {}, memoryDeps());
      expect(r.confidence, raw).toBe(1);
    }
  });
});
