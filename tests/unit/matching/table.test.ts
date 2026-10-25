import { describe, expect, it } from "vitest";
import { matchDish } from "@/server/services/matching";
import { memoryDeps } from "./helpers";

// Every row of the docs/05 "Test cases" table.
type Auto = { raw: string; dish: string; tags: string[] };
const auto: Auto[] = [
  { raw: "Chicken Karahi (Full)", dish: "chicken-karahi", tags: [] },
  { raw: "Murgh Karahi 1kg Rs.2200", dish: "chicken-karahi", tags: [] },
  { raw: "White Chicken Karahi Half", dish: "chicken-karahi", tags: ["white"] },
  { raw: "Chicken White Karahi Full 1kg Rs 2400", dish: "chicken-karahi", tags: ["white"] },
  { raw: "Mutton Peshawari Namkeen Karahi", dish: "namkeen-gosht", tags: ["peshawari"] },
  { raw: "Biryani", dish: "chicken-biryani", tags: [] },
  { raw: "Beef Smash Burger Double", dish: "beef-burger", tags: ["double"] },
  { raw: "Zinger Stacker", dish: "zinger-burger", tags: [] },
  { raw: "Chicken Fajita Pizza Large", dish: "pizza", tags: ["fajita"] },
  { raw: "Chicken Tikka Pizza", dish: "pizza", tags: [] },
  { raw: "Doodh Pati", dish: "chai", tags: [] },
];

type Review = {
  raw: string;
  method: "ALIAS" | "TRIGRAM";
  confidence: number;
  first: string;
  suggestions?: string[];
};
const review: Review[] = [
  {
    raw: "Chicken Namkeen Karahi",
    method: "ALIAS",
    confidence: 0.6,
    first: "namkeen-gosht",
    suggestions: ["namkeen-gosht", "chicken-karahi"],
  },
  { raw: "Chikan Kadhai", method: "TRIGRAM", confidence: 0.53, first: "chicken-karahi" },
  { raw: "Prawn Biryani", method: "ALIAS", confidence: 0.6, first: "chicken-biryani" },
  { raw: "Dahi Bhaly Chaat", method: "ALIAS", confidence: 0.75, first: "dahi-bhallay" },
  { raw: "Fish Karahi", method: "ALIAS", confidence: 0.75, first: "fish-fry" },
  { raw: "Shami Kabab", method: "TRIGRAM", confidence: 0.75, first: "bun-kabab" },
];

describe("docs/05 test table: auto-matched rows (ALIAS 1.0)", () => {
  it.each(auto)("$raw → $dish $tags", async ({ raw, dish, tags }) => {
    const r = await matchDish(raw, {}, memoryDeps());
    expect(r).toMatchObject({ dishSlug: dish, method: "ALIAS", confidence: 1, decision: "auto" });
    expect(r.variantTags).toEqual(tags);
  });
});

describe("docs/05 test table: review rows", () => {
  it.each(review)(
    "$raw → review, $method $confidence, first $first",
    async ({ raw, method, confidence, first, suggestions }) => {
      const r = await matchDish(raw, {}, memoryDeps());
      expect(r.decision).toBe("review");
      expect(r.method).toBe(method);
      expect(r.confidence).toBeCloseTo(confidence, 2);
      expect(r.candidates[0]?.dishSlug).toBe(first);
      expect(r.candidates.length).toBeLessThanOrEqual(3);
      if (suggestions)
        expect(r.candidates.map((c) => c.dishSlug).slice(0, suggestions.length)).toEqual(
          suggestions,
        );
    },
  );

  it("Karahi (per kg) → review: the karahi dishes, TRIGRAM capped at 0.50 (no meat word)", async () => {
    const r = await matchDish("Karahi (per kg)", {}, memoryDeps());
    expect(r).toMatchObject({ method: "TRIGRAM", confidence: 0.5, decision: "review" });
    expect(new Set(r.candidates.map((c) => c.dishSlug))).toEqual(
      new Set(["mutton-karahi", "beef-karahi", "chicken-karahi"]),
    );
    expect(r.candidates.every((c) => c.confidence === 0.5)).toBe(true);
  });

  it("Raita → NONE, review without suggestion", async () => {
    const r = await matchDish("Raita", {}, memoryDeps());
    expect(r).toMatchObject({
      dishId: null,
      method: "NONE",
      confidence: 0,
      decision: "review-no-suggestion",
      candidates: [],
    });
  });
});

describe("pipeline details", () => {
  it("normalises first and reports the normalised text", async () => {
    const r = await matchDish("Chicken White Karahi Full 1kg Rs 2400", {}, memoryDeps());
    expect(r.text).toBe("chicken white karahi");
  });

  it("an empty or unreadable name is NONE without calling the trigram step", async () => {
    let called = false;
    const r = await matchDish(
      "کڑاہی",
      {},
      memoryDeps({ trigram: async () => ((called = true), []) }),
    );
    expect(r.method).toBe("NONE");
    expect(called).toBe(false);
  });

  it("two dishes tying for the longest alias → review with both at 0.60", async () => {
    // "chapli" (chapli-kabab) and "burger" (beef-burger) are both 6 characters.
    const r = await matchDish("Chapli Burger", {}, memoryDeps());
    expect(r).toMatchObject({ method: "ALIAS", confidence: 0.6, decision: "review" });
    expect(new Set(r.candidates.slice(0, 2).map((c) => c.dishSlug))).toEqual(
      new Set(["chapli-kabab", "beef-burger"]),
    );
  });

  it("the meat-word retry resolves a conflict when the moved word forms a longer alias", async () => {
    const r = await matchDish("Seekh Kabab Chicken", {}, memoryDeps());
    expect(r).toMatchObject({ dishSlug: "chicken-seekh-kabab", method: "ALIAS", confidence: 1 });
  });

  it("a meat word on a dish whose name names no meat is ignored", async () => {
    const r = await matchDish("Chicken Pakora", {}, memoryDeps());
    expect(r).toMatchObject({ dishSlug: "pakora", confidence: 1 });
  });
});
