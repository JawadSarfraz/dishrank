import { describe, expect, it } from "vitest";
import { cleanText, normalize } from "@/server/services/matching/normalize";

describe("normalize (docs/05 step 1)", () => {
  it("matches the Phase 1 acceptance example", () => {
    expect(normalize("Chicken White Karahi Full 1kg Rs 2400")).toBe("chicken white karahi");
  });

  it.each([
    ["Chicken Karahi (Full)", "chicken karahi"],
    ["Murgh Karahi 1kg Rs.2200", "murgh karahi"],
    ["White Chicken Karahi Half", "white chicken karahi"],
    ["Karahi (per kg)", "karahi"],
    ["Chicken Fajita Pizza Large", "chicken fajita pizza"],
    ["Seekh Kabab (4 Pcs)", "seekh kabab"],
    ["Chicken Nuggets 6 pcs", "chicken nuggets"],
    ["Biryani 1,850/-", "biryani"],
    ["Hot & Sour Soup", "hot and sour soup"],
    ["Tak-a-Tak", "tak a tak"],
    ["Crème Brûlée", "creme brulee"],
    ["  Doodh   Pati  ", "doodh pati"],
  ])("%s → %s", (raw, expected) => {
    expect(normalize(raw)).toBe(expected);
  });

  it("keeps variant and meat words in the text", () => {
    expect(normalize("Desi Murgh Karahi Boneless")).toBe("desi murgh karahi boneless");
  });

  it("drops non-ASCII script and lone numbers", () => {
    expect(normalize("کڑاہی 2")).toBe("");
    expect(cleanText("Dahi Bhallay (Special!)")).toBe("dahi bhallay special");
  });

  it("removes size phrases only as whole words", () => {
    expect(normalize("Fullerton Burger")).toBe("fullerton burger"); // "full" is not stripped inside a word
    expect(normalize("Half Kg Mutton Karahi")).toBe("mutton karahi");
  });
});
