// Apply and re-run safety (docs/07 §2a, test DB).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/roles";
import { applyAutoListBatch, previewAutoList } from "@/server/services/auto-list.service";
import {
  createFromCandidate,
  linkCandidate,
  skipCandidate,
} from "@/server/services/import.service";
import { createOrReplace } from "@/server/services/rating.service";
import {
  markRestaurantChecked,
  listRestaurantsForAdmin,
  setRestaurantStatus,
  updateRestaurant,
} from "@/server/services/restaurant.service";
import { resetAppData } from "../../setup/db-reset";
import {
  ADMIN,
  USER,
  actorOf,
  makeRestaurant,
  makeUser,
  place,
  uid,
} from "../restaurants/fixtures";

const F7 = { lat: 33.7215, lng: 73.0569 };
const metresNorth = (m: number) => ({ lat: F7.lat + m / 111_200, lng: F7.lng });

let admin: SessionUser;

async function candidate(
  name: string,
  over: Partial<Prisma.OvertureCandidateUncheckedCreateInput> = {},
) {
  const { city, area } = await place("islamabad", "f-7");
  return db.overtureCandidate.create({
    data: {
      overtureId: `08f-${uid()}`,
      release: "2026-10-21.0",
      lastSeenRelease: "2026-10-21.0",
      cityId: city.id,
      suggestedAreaId: area.id,
      name,
      address: "Shop 3, Fixture Market",
      phone: "0511234567",
      category: "restaurant",
      confidence: 0.8,
      ...F7,
      sources: ["meta"],
      ...over,
    },
  });
}

const edit = (name: string, areaId: string, address: string) => ({
  name,
  areaId,
  address,
  phone: null,
  website: null,
  priceBand: null,
  aliases: [],
});

const statusOf = async (id: string) =>
  (await db.overtureCandidate.findUniqueOrThrow({ where: { id } })).status;

describe("Auto-list apply (test DB)", () => {
  beforeEach(async () => {
    await resetAppData();
    const user = await makeUser("Admin");
    admin = { ...ADMIN, id: user.id };
  });
  afterAll(() => db.$disconnect());

  it("checks the role itself (rule 6)", async () => {
    await expect(previewAutoList(USER)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(previewAutoList(null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(applyAutoListBatch(USER, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("the preview writes nothing and counts per city, area, category and reason", async () => {
    await candidate("Fixture Pizza Point Islamabad", { category: "pizza_restaurant" });
    await candidate("Low One", { confidence: 0.2 });
    const preview = await previewAutoList(admin);
    expect(preview).toMatchObject({ toCreate: 1, newCandidates: 2, dishLinks: 1, renamedCount: 1 });
    expect(preview.cities.find((c) => c.name === "Islamabad")).toMatchObject({
      count: 1,
      areas: [{ name: "F-7", count: 1 }],
    });
    expect(preview.categories).toEqual([{ name: "pizza restaurant", count: 1 }]);
    expect(preview.dishes.find((d) => d.name === "Pizza")).toEqual({
      name: "Pizza",
      listed: 0,
      onNew: 1,
      added: 0,
    });
    expect(preview.held).toMatchObject([{ reason: "LOW_CONFIDENCE", count: 1 }]);
    expect(await db.restaurant.count()).toBe(0);
    expect(await db.jobRun.count()).toBe(0);
  });

  it("creates an active OVERTURE restaurant under the clean name; the candidate keeps the original", async () => {
    const c = await candidate("BUTT KARAHI Islamabad", { website: "https://butt.example" });
    const now = new Date("2026-11-06T10:00:00Z");
    const result = await applyAutoListBatch(admin, {}, now);
    expect(result).toMatchObject({ created: 1, dishLinks: 2, failed: 0, skipped: 0, remaining: 0 });
    expect(result.paths).toEqual(
      expect.arrayContaining([
        "/islamabad/best-chicken-karahi",
        "/islamabad/best-mutton-karahi",
        "/islamabad",
        "/",
      ]),
    );

    const restaurant = await db.restaurant.findFirstOrThrow({
      include: { dishes: { include: { dish: true } }, area: true },
    });
    expect(restaurant).toMatchObject({
      name: "Butt Karahi",
      slug: "butt-karahi-f-7",
      status: "ACTIVE",
      source: "OVERTURE",
      overtureId: c.overtureId,
      lat: F7.lat,
      lng: F7.lng,
      locationSource: "OVERTURE",
      address: "Shop 3, Fixture Market",
      phone: "0511234567",
      website: "https://butt.example",
      searchText: "butt karahi",
      autoListedAt: now,
      checkedAt: null,
    });
    expect(restaurant.area?.slug).toBe("f-7");
    expect(restaurant.dishes.map((d) => d.dish.slug).sort()).toEqual([
      "chicken-karahi",
      "mutton-karahi",
    ]);
    for (const d of restaurant.dishes) {
      expect(d).toMatchObject({
        status: "CANDIDATE",
        source: "AUTO_LIST",
        confidence: 0.3,
        ratingCount: 0,
        score: null,
        rankInCity: null,
      });
    }
    expect(await db.rating.count()).toBe(0);

    expect(await db.overtureCandidate.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      status: "CREATED",
      name: "BUTT KARAHI Islamabad",
      restaurantId: restaurant.id,
      reviewedByUserId: admin.id,
      reviewedAt: now,
      autoListedAt: now,
    });
  });

  it("running it again creates nothing, and its duplicates stay NEW", async () => {
    const strong = await candidate("Fixture Grill", { confidence: 0.9 });
    const weak = await candidate("Fixture Grill Islamabad", { confidence: 0.7 });
    await applyAutoListBatch(admin, {});
    expect(await db.restaurant.count()).toBe(1);
    expect(await statusOf(strong.id)).toBe("CREATED");
    expect(await statusOf(weak.id)).toBe("NEW");

    expect(await previewAutoList(admin)).toMatchObject({ toCreate: 0 });
    expect(await applyAutoListBatch(admin, {})).toMatchObject({ created: 0, remaining: 0 });
    expect(await db.restaurant.count()).toBe(1);
    expect(await statusOf(weak.id)).toBe("NEW");
  });

  it("works in batches: a stopped run carries on, ending with the same restaurants", async () => {
    const names = ["One Grill", "Two Cafe", "Three Kitchen Place", "Four Tikka", "Five Pulao"];
    for (const [i, name] of names.entries()) {
      await candidate(name, { confidence: 0.9 - i / 100, ...metresNorth(2000 * i) });
    }
    expect(await applyAutoListBatch(admin, { limit: 2 })).toMatchObject({
      created: 2,
      remaining: 3,
    });
    expect(await applyAutoListBatch(admin, { limit: 2 })).toMatchObject({
      created: 2,
      remaining: 1,
    });
    expect(await applyAutoListBatch(admin, { limit: 2 })).toMatchObject({
      created: 1,
      remaining: 0,
    });
    const created = await db.restaurant.findMany({ orderBy: { name: "asc" } });
    expect(created.map((r) => r.name)).toEqual([...names].sort());
  });

  it("never touches a restaurant made or edited by hand, however similar", async () => {
    const hand = await makeRestaurant("Hand Karahi", { ...F7, phone: "0519999999" });
    const handBefore = await db.restaurant.findUniqueOrThrow({ where: { id: hand.id } });
    const dup = await candidate("Hand Karahi Islamabad", { confidence: 0.99 });
    const pending = await candidate("Reviewed By Hand", { ...metresNorth(3000) });
    const { area } = await place("islamabad", "f-7");
    await createFromCandidate(admin, {
      candidateId: pending.id,
      name: "Signboard Spelling",
      areaId: area.id,
      address: "Typed by the admin",
      dishSlugs: [],
    });
    const again = await candidate("Reviewed By Hand", { ...metresNorth(3020) });

    expect(await applyAutoListBatch(admin, {})).toMatchObject({ created: 0 });
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: hand.id } })).toEqual(handBefore);
    expect(await statusOf(dup.id)).toBe("NEW");
    expect(await statusOf(again.id)).toBe("NEW");
    expect(
      await db.restaurant.findFirstOrThrow({ where: { name: "Signboard Spelling" } }),
    ).toMatchObject({ autoListedAt: null, source: "OVERTURE" });
  });

  it("an edited auto-listed restaurant keeps its edit through a later run", async () => {
    await candidate("Fixture Grill");
    await applyAutoListBatch(admin, {});
    const r = await db.restaurant.findFirstOrThrow({ include: { area: true } });
    await updateRestaurant(admin, r.id, edit("Fixture Grill By Hand", r.areaId!, "Corrected"));
    await candidate("Fixture Grill", { overtureId: "08f-new-id-of-the-same-place" });
    expect(await applyAutoListBatch(admin, {})).toMatchObject({ created: 0 });
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
      name: "Fixture Grill By Hand",
      address: "Corrected",
    });
    expect(await db.restaurant.count()).toBe(1);
  });

  it("a re-run also keeps a neighbour with the same first word NEW", async () => {
    const strong = await candidate("Trieste Bahria Town", { confidence: 0.9 });
    const weak = await candidate("Cafe Trieste", { confidence: 0.7, ...metresNorth(30) });
    await applyAutoListBatch(admin, {});
    expect(await statusOf(strong.id)).toBe("CREATED");
    expect(await statusOf(weak.id)).toBe("NEW");
    expect(await applyAutoListBatch(admin, {})).toMatchObject({ created: 0, remaining: 0 });
    expect(await statusOf(weak.id)).toBe("NEW");
  });

  it("a place without an address can be listed and its name fixed without inventing one", async () => {
    await candidate("Fixture Grill", { address: null });
    await applyAutoListBatch(admin, {});
    const r = await db.restaurant.findFirstOrThrow();
    expect(r.address).toBeNull();
    await updateRestaurant(admin, r.id, {
      ...edit("Fixture Grille", r.areaId!, "x"),
      address: null,
    });
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
      name: "Fixture Grille",
      address: null,
    });
  });

  it("linking a candidate to an auto-listed restaurant counts as a check", async () => {
    await candidate("Fixture Grill");
    await applyAutoListBatch(admin, {});
    const r = await db.restaurant.findFirstOrThrow();
    expect(r.checkedAt).toBeNull();
    const again = await candidate("Fixture Grill", { overtureId: "08f-another-record" });
    await linkCandidate(admin, { candidateId: again.id, restaurantId: r.id });
    expect(
      (await db.restaurant.findUniqueOrThrow({ where: { id: r.id } })).checkedAt,
    ).not.toBeNull();
  });

  it("the back-fill adds missing links only: nothing else changes, and a re-run adds none", async () => {
    await candidate("Haleem Ghar");
    await candidate("Butt Karahi", { ...metresNorth(3000) });
    await candidate("Fixture Pizza", { ...metresNorth(6000), category: "pizza_restaurant" });
    await candidate("Checked Haleem Place", { ...metresNorth(9000) });
    await applyAutoListBatch(admin, {});
    const byName = (name: string) => db.restaurant.findFirstOrThrow({ where: { name } });

    // As if these restaurants were listed before the dish rules grew.
    const haleem = await byName("Haleem Ghar");
    await db.restaurantDish.deleteMany({ where: { restaurantId: haleem.id } });
    const butt = await byName("Butt Karahi");
    const chickenKarahi = await db.dish.findUniqueOrThrow({ where: { slug: "chicken-karahi" } });
    const muttonKarahi = await db.dish.findUniqueOrThrow({ where: { slug: "mutton-karahi" } });
    await db.restaurantDish.deleteMany({
      where: { restaurantId: butt.id, dishId: muttonKarahi.id },
    });
    // An owner or admin removed this one: it must not come back or change.
    await db.restaurantDish.updateMany({
      where: { restaurantId: butt.id, dishId: chickenKarahi.id },
      data: { status: "REMOVED", confidence: 0.9 },
    });
    // This one has a life of its own by now.
    const pizza = await byName("Fixture Pizza");
    await db.restaurantDish.updateMany({
      where: { restaurantId: pizza.id },
      data: { status: "USER_CONFIRMED", source: "MENU_PHOTO", price: 1450 },
    });
    // An admin looked at this one: it is left alone.
    const checked = await byName("Checked Haleem Place");
    await db.restaurantDish.deleteMany({ where: { restaurantId: checked.id } });
    await markRestaurantChecked(admin, checked.id);
    // Made by hand, whatever its name says.
    const hand = await makeRestaurant("Hand Haleem Corner", { ...metresNorth(12_000) });

    const rowsBefore = await db.restaurantDish.findMany({ orderBy: { id: "asc" } });
    const restaurantsBefore = await db.restaurant.findMany({ orderBy: { id: "asc" } });

    const preview = await previewAutoList(admin);
    expect(preview.backfill).toEqual({ links: 2, restaurants: 2, leftAlone: 1 });
    const count = (name: string) => preview.dishes.find((d) => d.name === name)!;
    expect(count("Haleem")).toMatchObject({ added: 1, onNew: 0, listed: 0 });
    expect(count("Mutton Karahi")).toMatchObject({ added: 1 });
    expect(count("Chicken Karahi")).toMatchObject({ added: 0, listed: 0 });
    expect(await db.restaurantDish.count()).toBe(rowsBefore.length); // the dry run wrote nothing

    const result = await applyAutoListBatch(admin, {});
    expect(result).toMatchObject({ created: 0, dishLinksAdded: 2, remaining: 0 });
    expect(result.paths).toEqual(
      expect.arrayContaining([
        "/islamabad/best-haleem",
        "/islamabad/best-mutton-karahi",
        `/islamabad/r/${haleem.slug}`,
        "/islamabad",
        "/",
      ]),
    );

    // Every row that existed is exactly as it was, and so is every restaurant.
    const rowsAfter = await db.restaurantDish.findMany({ orderBy: { id: "asc" } });
    expect(rowsAfter.filter((row) => rowsBefore.some((b) => b.id === row.id))).toEqual(rowsBefore);
    expect(await db.restaurant.findMany({ orderBy: { id: "asc" } })).toEqual(restaurantsBefore);

    const added = rowsAfter.filter((row) => !rowsBefore.some((b) => b.id === row.id));
    expect(added.map((row) => row.restaurantId).sort()).toEqual([butt.id, haleem.id].sort());
    for (const row of added) {
      expect(row).toMatchObject({
        status: "CANDIDATE",
        source: "AUTO_LIST",
        confidence: 0.3,
        ratingCount: 0,
        rankInCity: null,
      });
    }
    expect(await db.restaurantDish.count({ where: { restaurantId: checked.id } })).toBe(0);
    expect(await db.restaurantDish.count({ where: { restaurantId: hand.id } })).toBe(0);

    // Safe to re-run.
    expect((await previewAutoList(admin)).backfill.links).toBe(0);
    expect(await applyAutoListBatch(admin, {})).toMatchObject({ created: 0, dishLinksAdded: 0 });
    expect(await db.restaurantDish.count()).toBe(rowsAfter.length);
  });

  it("leaves a candidate alone that an admin skipped, and its duplicates", async () => {
    const skipped = await candidate("Fixture Skipped");
    await skipCandidate(admin, { candidateId: skipped.id, reason: "NOT_A_RESTAURANT" });
    const returned = await candidate("Fixture Skipped", { overtureId: "08f-churned-id" });
    expect(await applyAutoListBatch(admin, {})).toMatchObject({ created: 0 });
    expect(await statusOf(skipped.id)).toBe("SKIPPED");
    expect(await statusOf(returned.id)).toBe("NEW");
  });

  it("a dish link gives no rank: the row ranks only from real ratings", async () => {
    await candidate("Fixture Pizza", { category: "pizza_restaurant" });
    await applyAutoListBatch(admin, {});
    const row = await db.restaurantDish.findFirstOrThrow();
    expect(row).toMatchObject({ status: "CANDIDATE", rankInCity: null, distinctRaters: 0 });
    const user = await makeUser("Diner");
    await createOrReplace(actorOf({ ...user, role: "USER" }), {
      restaurantId: row.restaurantId,
      dishId: row.dishId,
      score: 9,
    });
    expect(await db.restaurantDish.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      status: "CANDIDATE",
      distinctRaters: 1,
      rankInCity: null,
    });
  });

  it("the filter lists auto-listed restaurants not checked yet; a check, edit or status ends that", async () => {
    await makeRestaurant("Hand Made Place");
    for (const [i, name] of ["Alpha Grill", "Beta Kitchen Place", "Gamma Cafe"].entries()) {
      await candidate(name, { ...metresNorth(3000 * i) });
    }
    await applyAutoListBatch(admin, {});
    const unchecked = async () =>
      (await listRestaurantsForAdmin(admin, { page: 1, check: "auto-unchecked" })).items.map(
        (r) => r.name,
      );
    expect(await unchecked()).toEqual(["Alpha Grill", "Beta Kitchen Place", "Gamma Cafe"]);

    const rows = await db.restaurant.findMany({ where: { autoListedAt: { not: null } } });
    const byName = (name: string) => rows.find((r) => r.name === name)!;

    await markRestaurantChecked(admin, byName("Alpha Grill").id);
    expect(await unchecked()).toEqual(["Beta Kitchen Place", "Gamma Cafe"]);

    const beta = byName("Beta Kitchen Place");
    await updateRestaurant(admin, beta.id, edit("Beta Kitchen", beta.areaId!, "Fixed"));
    expect(await unchecked()).toEqual(["Gamma Cafe"]);

    await setRestaurantStatus(admin, byName("Gamma Cafe").id, "CLOSED");
    expect(await unchecked()).toEqual([]);
  });

  it("a hand-made restaurant cannot be marked checked", async () => {
    const hand = await makeRestaurant("Hand Made Place");
    await expect(markRestaurantChecked(admin, hand.id)).rejects.toMatchObject({
      code: "NOT_AUTO_LISTED",
    });
    await expect(markRestaurantChecked(USER, hand.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
