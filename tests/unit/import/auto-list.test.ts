import { describe, expect, it } from "vitest";
import {
  AUTO_LIST,
  autoListDishes,
  cleanPlaceName,
  looksLikeNotEating,
  planAutoList,
  type AutoListRow,
} from "@/server/services/overture/auto-list";

const F7 = { lat: 33.7215, lng: 73.0569 };
const metresNorth = (m: number) => ({ lat: F7.lat + m / 111_200, lng: F7.lng });

let next = 0;
function row(name: string, over: Partial<AutoListRow> = {}): AutoListRow {
  next += 1;
  return {
    id: `c${next}`,
    overtureId: `08f-${next}`,
    name,
    address: "Shop 3, Fixture Market",
    phone: "0511234567",
    website: null,
    category: "restaurant",
    confidence: 0.8,
    ...F7,
    lastSeenRelease: "2026-10-21.0",
    cityId: "isb",
    suggestedAreaId: "f-7",
    ...over,
  };
}

function plan(candidates: AutoListRow[], over: Partial<Parameters<typeof planAutoList>[0]> = {}) {
  return planAutoList({
    candidates,
    restaurants: [],
    reviewed: [],
    usedOvertureIds: new Set(),
    release: "2026-10-21.0",
    areaNames: ["F-7", "Saddar", "Blue Area"],
    ...over,
  });
}

const reasonOf = (result: ReturnType<typeof plan>, id: string) =>
  result.held.find((h) => h.row.id === id)?.reason;

describe("cleanPlaceName: only shortens and re-cases, never invents", () => {
  it.each([
    ["Cafe Day Dreams Islamabad", "Cafe Day Dreams"],
    ["Savour Foods, Blue Area, Islamabad", "Savour Foods, Blue Area"],
    ["Karachi Biryani House | Islamabad", "Karachi Biryani House"],
    ["CREMA - Islamabad", "Crema"],
    ["Cake5Star.islamabad", "Cake5Star"],
    ["Cheezy4 Pizza in Rawalpindi", "Cheezy4 Pizza"],
    ["Buddies ( Commercial Market Rawalpindi )", "Buddies (Commercial Market)"],
    ["Coffee Planet Pakistan", "Coffee Planet"],
    ["Asian Fusion Official", "Asian Fusion"],
    ["Pani - Every Drop Counts Pvt Ltd", "Pani - Every Drop Counts"],
    ["Tariq Foods (Pvt) Ltd.", "Tariq Foods"],
    ["Fazal Foods Private Limited", "Fazal Foods"],
    ["Ludhiana ☕ Tea Shop", "Ludhiana Tea Shop"],
    ["Pizza 🍕 Palace 🍕", "Pizza Palace"],
    ["Ｐｉｚｚａ Ｋｉｎｇｄｏｍ", "Pizza Kingdom"],
    ["𝗟 𝗨 𝗡 𝗔 𝗥", "Lunar"],
    ["Niaz Café - نیاز کیفے", "Niaz Café"],
    ["Shahi Lahori Nashta Centerشاہی لاہوری ناشتہ سینٹر", "Shahi Lahori Nashta Center"],
    ["Sufi’s", "Sufi's"],
    ["The Burger Co.", "The Burger Co."],
    ["Baoo Muhaala Rawalpindi.", "Baoo Muhaala"],
  ])("%s → %s", (raw, clean) => {
    expect(cleanPlaceName(raw)).toBe(clean);
  });

  it.each([
    ["PIZZA KING", "Pizza King"],
    ["SFK FOOD", "SFK Food"],
    ["ZAIQA TEA", "Zaiqa Tea"],
    ["UG HOUSE", "UG House"],
    ["PIT STOP", "Pit Stop"],
    ["MR COD", "Mr Cod"],
    ["CREMA I-8", "Crema I-8"],
    ["KFC", "KFC"],
    ["OPTP", "OPTP"],
    ["Italian PIZZA I-8 Markaz", "Italian Pizza I-8 Markaz"],
    ["KHIVA Revolving Restaurant", "Khiva Revolving Restaurant"],
    ["lahoree chatkhara", "Lahoree Chatkhara"],
    ["McDonald's", "McDonald's"],
  ])("fixes capitals: %s → %s", (raw, clean) => {
    expect(cleanPlaceName(raw)).toBe(clean);
  });

  it("keeps the city when the rest would say nothing, or when it is not at the end", () => {
    expect(cleanPlaceName("Cake Shop Islamabad")).toBe("Cake Shop Islamabad");
    expect(cleanPlaceName("Islamabad Murgh Pulao")).toBe("Islamabad Murgh Pulao");
    expect(cleanPlaceName("Islamabadmarketing")).toBe("Islamabadmarketing");
  });

  it("returns null when no usable Latin name is left", () => {
    expect(cleanPlaceName("Rawalpindi")).toBeNull();
    expect(cleanPlaceName("Rawalpindi راولپنڈی")).toBeNull();
    expect(cleanPlaceName("لالہ جی شنواری ھوٹل")).toBeNull();
    expect(cleanPlaceName("سکون.com")).toBeNull();
    expect(cleanPlaceName("ΛMΛYΛ")).toBeNull();
  });

  it("every word of a cleaned name comes from the original", () => {
    for (const raw of [
      "Food and Pedestrian Street Rawalpindi Saddar-Official",
      "New Karachi Roll Paratha And Fast Food | Bangash Colony Pirwadhai",
      "SAM'S GRILL Gilgit / Baltistan HOUSE",
    ]) {
      const words = (cleanPlaceName(raw) ?? "").toLowerCase().split(/[^a-z0-9']+/);
      for (const word of words) expect(raw.toLowerCase()).toContain(word);
    }
  });
});

describe("looksLikeNotEating", () => {
  it.each([
    "Saidpur Village",
    "Tariq Traders",
    "Mediterranean Apartments Diplomatic Enclave",
    "Al-Awan Marriage Hall",
    "Silver Oaks Net Cafe",
    "RK Electronics",
  ])("holds %s", (name) => expect(looksLikeNotEating(name)).toBe(true));

  it.each([
    "Saidpur Village Restaurant",
    "Chaaye Khana 6th Road",
    "Yar e Man Restaurant, Guest House and wedding Hall",
    "BBQ Terrace Garrison Club",
  ])("lets %s through", (name) => expect(looksLikeNotEating(name)).toBe(false));
});

describe("autoListDishes: only what the name or category clearly says", () => {
  it.each([
    ["Pizza Hut", "restaurant", ["pizza"]],
    ["Pappasallis", "pizza_restaurant", ["pizza"]],
    ["Deewan Broast", "restaurant", ["broast"]],
    ["Syrian Shawarma", "restaurant", ["chicken-shawarma"]],
    ["Chaaye Khana", "cafe", ["chai"]],
    ["Pappu Chaiwala", "cafe", ["chai"]],
    ["Zaiqa Tea", "cafe", ["chai"]],
    ["Hot Leaf", "tea_room", ["chai"]],
    ["Karachi Biryani House", "restaurant", ["chicken-biryani"]],
    ["Butt Karahi", "restaurant", ["chicken-karahi", "mutton-karahi"]],
    ["Chicken Karahi Point", "restaurant", ["chicken-karahi"]],
    ["Mutton Karahi Point", "restaurant", ["mutton-karahi"]],
    ["Muhammadi Nahari House", "restaurant", ["beef-nihari"]],
    ["Tikka Mehal", "restaurant", ["chicken-tikka"]],
    ["Kabab Jees", "restaurant", ["beef-seekh-kabab"]],
    ["Chapli Kabab House", "restaurant", ["chapli-kabab"]],
    ["Burger Point", "restaurant", ["beef-burger", "zinger-burger"]],
    ["Fixture", "burger_restaurant", ["beef-burger", "zinger-burger"]],
  ])("%s (%s) → %j", (name, category, dishes) => {
    expect(autoListDishes(name, category)).toEqual(dishes);
  });

  it.each([
    ["Bubble Tea House", "cafe"],
    ["The Coffee Bean & Tea Leaf", "coffee_shop"],
    ["Beef Biryani Corner", "restaurant"],
    ["Doner Kebab", "restaurant"],
    ["Mutton Tikka House", "restaurant"],
    ["Chipizza", "restaurant"], // whole words only
    ["Haleem Ghar", "restaurant"], // not on the owner's list
    ["Bait Al Arab Mandi", "restaurant"],
    ["Savour Foods", "pakistani_restaurant"],
  ])("%s (%s) links nothing", (name, category) => {
    expect(autoListDishes(name, category)).toEqual([]);
  });
});

describe("planAutoList: who is listed", () => {
  it("needs a real location, a suggested area, the floor, a food category and the latest release", () => {
    const fine = row("Fixture Grill");
    const noLocation = row("No Location", { lat: null, lng: null });
    const noArea = row("No Area", { suggestedAreaId: null });
    const atFloor = row("At The Floor", {
      confidence: AUTO_LIST.minConfidence,
      ...metresNorth(2000),
    });
    const low = row("Low Confidence", { confidence: AUTO_LIST.minConfidence - 0.01 });
    const bare = row("Bare Category", { category: "food_and_drink" });
    const noCategory = row("No Category", { category: null });
    const gone = row("Gone Place", { lastSeenRelease: "2026-09-01.0" });
    const result = plan([fine, noLocation, noArea, atFloor, low, bare, noCategory, gone]);
    expect(result.picks.map((p) => p.id).sort()).toEqual([fine.id, atFloor.id].sort());
    expect(reasonOf(result, noLocation.id)).toBe("NO_LOCATION");
    expect(reasonOf(result, noArea.id)).toBe("NO_AREA");
    expect(reasonOf(result, low.id)).toBe("LOW_CONFIDENCE");
    expect(reasonOf(result, bare.id)).toBe("CATEGORY");
    expect(reasonOf(result, noCategory.id)).toBe("CATEGORY");
    expect(reasonOf(result, gone.id)).toBe("MISSING_FROM_LATEST");
  });

  it("holds names that are not names, and what is not a place to eat", () => {
    const city = row("Rawalpindi");
    const area = row("Saddar Rawalpindi");
    const generic = row("Food Court");
    const mill = row("Al Sajjad Roller Flour Mills");
    const long = row(`Fixture ${"Very Long ".repeat(10)}Name`);
    const result = plan([city, area, generic, mill, long]);
    expect(result.picks).toEqual([]);
    for (const c of [city, area, generic, long]) expect(reasonOf(result, c.id)).toBe("NAME");
    expect(reasonOf(result, mill.id)).toBe("NOT_EATING");
  });

  it("keeps the strongest of likely duplicates and leaves the others NEW", () => {
    const weak = row("Fixture Grill", { confidence: 0.7, website: "https://a.example" });
    const strong = row("Fixture Grill Islamabad", { confidence: 0.9 });
    const tied = row("FIXTURE GRILL", { confidence: 0.7, phone: null, ...metresNorth(30) });
    const sameNameFar = row("Fixture Grill", { confidence: 0.65, ...metresNorth(900) });
    const elsewhere = row("Fixture Grill", { confidence: 0.65, ...metresNorth(1500) });
    const other = row("Another Place", { confidence: 0.65 });
    const result = plan([weak, tied, sameNameFar, elsewhere, strong, other]);
    expect(result.picks.map((p) => p.id).sort()).toEqual(
      [strong.id, elsewhere.id, other.id].sort(),
    );
    for (const c of [weak, tied, sameNameFar]) expect(reasonOf(result, c.id)).toBe("DUPLICATE");
  });

  it("the strongest is the most confident, then the fullest record", () => {
    const bare = row("Fixture Twin", { confidence: 0.8, phone: null, address: null });
    const full = row("Fixture Twin", { confidence: 0.8, website: "https://t.example" });
    expect(plan([bare, full]).picks.map((p) => p.id)).toEqual([full.id]);
  });

  it("is the same plan for the same input, whatever the order", () => {
    const rows = [
      row("Fixture A", { confidence: 0.9 }),
      row("Fixture A", { confidence: 0.8 }),
      row("Fixture B"),
    ];
    const ids = (r: ReturnType<typeof plan>) => r.picks.map((p) => p.id);
    expect(ids(plan([...rows].reverse()))).toEqual(ids(plan(rows)));
  });

  it("never picks a place one of our restaurants already is, of any status", () => {
    const restaurant = (name: string, status: string, over = {}) => ({
      id: `r-${name}`,
      slug: name.toLowerCase(),
      name,
      aliases: [],
      ...F7,
      areaId: "f-7",
      areaName: "F-7",
      status,
      ...over,
    });
    const hand = row("Butt Karahi");
    const closed = row("Closed Place Islamabad");
    const merged = row("Merged Away");
    const byAlias = row("But Karahi House");
    const byOverture = row("Fresh Name Here", { ...metresNorth(5000) });
    const noLocation = row("Unlocated Place");
    const result = plan([hand, closed, merged, byAlias, byOverture, noLocation], {
      restaurants: [
        restaurant("Butt Karahi", "ACTIVE"),
        restaurant("Closed Place", "CLOSED"),
        restaurant("Merged Away", "DUPLICATE"),
        restaurant("Other Name", "ACTIVE", { aliases: ["But Karahi House"] }),
        restaurant("Unlocated Place", "ACTIVE", { lat: null, lng: null }),
      ],
      usedOvertureIds: new Set([byOverture.overtureId]),
    });
    expect(result.picks).toEqual([]);
    for (const c of [hand, closed, merged, byAlias, byOverture, noLocation]) {
      expect(reasonOf(result, c.id)).toBe("DUPLICATE_OF_RESTAURANT");
    }
  });

  it("a duplicate of a candidate an admin skipped is not listed behind their back", () => {
    const again = row("Not A Restaurant Cafe", { overtureId: "08f-new-id" });
    const result = plan([again], {
      reviewed: [{ id: "skipped", name: "Not A Restaurant Cafe", ...metresNorth(20) }],
    });
    expect(result.picks).toEqual([]);
    expect(reasonOf(result, again.id)).toBe("DUPLICATE_OF_REVIEWED");
  });
});
