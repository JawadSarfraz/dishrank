// Apply and re-run safety (docs/07 §2a, test DB).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/roles";
import { applyAutoListBatch, previewAutoList } from "@/server/services/auto-list.service";
import { createFromCandidate, skipCandidate } from "@/server/services/import.service";
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
    expect(preview.dishes).toEqual([{ name: "Pizza", count: 1 }]);
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
