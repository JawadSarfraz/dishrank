import { describe, expect, it } from "vitest";
import dishes from "../../../seed/dishes.json";
import { cleanText } from "@/server/services/matching/normalize";
import { suggestDishes } from "@/server/services/overture/dish-hints";

// The launch dishes' spellings, as DishAlias stores them (the dish name is an alias too).
const ALIASES = dishes
  .filter((d) => d.isLaunch)
  .flatMap((d) => [d.name, ...d.aliases].map((a) => ({ alias: cleanText(a), dishSlug: d.slug })));

const hints = (name: string, categories: (string | null)[] = []) =>
  [...suggestDishes(name, categories, ALIASES)].sort();

describe("dish pre-ticks on the import Create form (docs/07 §2)", () => {
  it("ticks every launch dish the name spells out", () => {
    expect(hints("Karachi Biryani and Broast")).toEqual(["broast", "chicken-biryani"]);
    expect(hints("Waris Nihari")).toEqual(["beef-nihari"]);
    expect(hints("Quetta Chai Cafe")).toEqual(["chai"]);
    expect(hints("Fixture Shawarma Corner")).toEqual(["chicken-shawarma"]);
    expect(hints("Zinger Point")).toEqual(["zinger-burger"]);
    expect(hints("The Burger House")).toEqual(["beef-burger"]);
    expect(hints("Pizza Hut F-7")).toEqual(["pizza"]);
    expect(hints("Savour Foods")).toEqual([]);
  });

  it("ticks both karahis for a bare karahi, the named one otherwise", () => {
    expect(hints("Butt Karahi")).toEqual(["chicken-karahi", "mutton-karahi"]);
    expect(hints("Fixture Kadai House")).toEqual(["chicken-karahi", "mutton-karahi"]);
    expect(hints("Fixture Chicken Karahi Point")).toEqual(["chicken-karahi"]);
    expect(hints("Fixture Namkeen Karahi")).toEqual(["namkeen-gosht"]);
  });

  it("skips markets, roads and breakfast words", () => {
    expect(hints("Sabzi Mandi Hotel")).toEqual([]);
    expect(hints("Fixture Mandi Road Dhaba")).toEqual([]);
    expect(hints("Al Arabia Mandi House")).toEqual(["chicken-mandi"]);
    expect(hints("Lahori Nashta Point")).toEqual([]);
  });

  it("ticks pizza, burger and chai from Overture categories", () => {
    expect(hints("Fixture Bistro", ["pizza_restaurant", "italian_restaurant"])).toEqual(["pizza"]);
    expect(hints("Fixture Grill", [null, "burger_restaurant"])).toEqual(["beef-burger"]);
    expect(hints("Fixture Dhaba", ["tea_room"])).toEqual(["chai"]);
    expect(hints("Fixture Wings", ["chicken_restaurant"])).toEqual([]);
  });
});
