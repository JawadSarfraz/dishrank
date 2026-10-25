import { describe, expect, it } from "vitest";
import { isSlug, slugify } from "@/lib/slug";

describe("slugify", () => {
  it.each([
    [["Butt Karahi", "F-7"], "butt-karahi-f-7"],
    [["Chicken Karahi"], "chicken-karahi"],
    [["Café Fixturé"], "cafe-fixture"],
    [["  Fixture Foods  (Blue Area) "], "fixture-foods-blue-area"],
    [["Kabab & Grill"], "kabab-and-grill"],
    [["Bahria Town (Phase 1-8)"], "bahria-town-phase-1-8"],
    [["کڑاہی"], ""],
  ])("%j → %s", (parts, expected) => {
    expect(slugify(...(parts as string[]))).toBe(expected);
  });

  it("produces valid slugs", () => {
    expect(isSlug(slugify("Fixture Grill", "Pir Sohawa"))).toBe(true);
    expect(isSlug("Bad Slug")).toBe(false);
    expect(isSlug("trailing-")).toBe(false);
  });
});
