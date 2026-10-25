import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/roles";
import {
  createFromCandidate,
  getImportQueue,
  linkCandidate,
  reopenCandidate,
  skipCandidate,
} from "@/server/services/import.service";
import { mergeRestaurants } from "@/server/services/restaurant.service";
import { resetAppData } from "../../setup/db-reset";
import { ADMIN, USER, makeRestaurant, makeUser, place, uid } from "../restaurants/fixtures";

const F7 = { lat: 33.7215, lng: 73.0569 };
const metresNorth = (m: number) => ({ lat: F7.lat + m / 111_200, lng: F7.lng });

let admin: SessionUser;

/** A staged Overture place (as `pnpm overture:sync` writes it), in F-7 unless `over` says otherwise. */
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
      confidence: 0.7,
      ...F7,
      sources: ["meta"],
      ...over,
    },
  });
}

async function form(candidateId: string, over: Record<string, unknown> = {}) {
  const { area } = await place("islamabad", "f-7");
  return {
    candidateId,
    name: "Fixture Karahi House",
    areaId: area.id,
    address: "Jinnah Super, F-7 Markaz",
    phone: "0511234567",
    website: "https://fixture-karahi.example",
    dishSlugs: ["chicken-karahi", "haleem"],
    ...over,
  };
}

describe("/admin/import review (docs/07 §2, test DB)", () => {
  beforeEach(async () => {
    await resetAppData();
    const user = await makeUser("Admin");
    admin = { ...ADMIN, id: user.id };
  });
  afterAll(() => db.$disconnect());

  it("checks the role itself (rule 6)", async () => {
    const c = await candidate("Fixture Grill");
    await expect(getImportQueue(USER, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createFromCandidate(null, await form(c.id))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(skipCandidate(USER, { candidateId: c.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("lists the busiest area's places by confidence, with counts, dish pre-ticks and duplicate hints", async () => {
    const { area: g9 } = await place("islamabad", "g-9");
    const pizza = await candidate("Fixture Pizza Point", {
      confidence: 0.95,
      category: "pizza_restaurant",
    });
    const karahi = await candidate("Fixture Karahi House", { confidence: 0.9 });
    await candidate("Fixture Tea Stall", {
      confidence: 0.4,
      status: "SKIPPED",
      skipReason: "CLOSED",
    });
    await candidate("Fixture G-9 Tikka", { suggestedAreaId: g9.id });
    const unknown = await candidate("Fixture Unknown Broast", {
      suggestedAreaId: null,
      lat: null,
      lng: null,
    });
    // Our restaurant 20 m away, and an Overture twin 15 m away that was already created as it.
    const ours = await makeRestaurant("Fixture Karahi House", { ...metresNorth(20) });
    await candidate("Fixture Karahi House F-7", {
      ...metresNorth(15),
      status: "CREATED",
      restaurantId: ours.id,
    });
    await db.jobRun.create({
      data: { name: "overture-sync", ok: true, summary: { release: "2026-11-18.0" } },
    });

    const queue = await getImportQueue(admin, { city: "islamabad" });
    expect(queue.area?.slug).toBe("f-7");
    expect(queue.areas.find((a) => a.slug === "f-7")?.newCount).toBe(2);
    expect(queue.areas.find((a) => a.slug === "g-9")?.newCount).toBe(1);
    expect(queue.noAreaCount).toBe(1);
    expect(queue.release).toBe("2026-11-18.0");
    expect(queue.candidates.map((c) => c.id)).toEqual([pizza.id, karahi.id]);

    const [first, second] = queue.candidates;
    expect(first).toMatchObject({ dishSlugs: ["pizza"], categories: ["pizza restaurant"] });
    expect(first.likelyRestaurants).toEqual([]);
    expect(second.dishSlugs).toEqual(["chicken-karahi", "mutton-karahi"]);
    expect(second.missingFromLatest).toBe(true); // last seen in 2026-10-21.0
    expect(second.likelyRestaurants).toMatchObject([{ id: ours.id, metres: 20 }]);
    expect(second.likelyCandidates).toMatchObject([
      {
        name: "Fixture Karahi House F-7",
        metres: 15,
        status: "CREATED",
        restaurant: { id: ours.id },
      },
    ]);

    const skipped = await getImportQueue(admin, {
      city: "islamabad",
      area: "f-7",
      show: "skipped",
    });
    expect(skipped.candidates.map((c) => [c.name, c.skipReason])).toEqual([
      ["Fixture Tea Stall", "CLOSED"],
    ]);
    const none = await getImportQueue(admin, { city: "islamabad", area: "none" });
    expect(none.area).toBeNull();
    expect(none.candidates.map((c) => [c.id, c.location])).toEqual([[unknown.id, null]]);
  });

  it("Create: the confirmed form, Overture's id and location, ticked dishes as CANDIDATE / ADMIN / 0.4", async () => {
    const c = await candidate("Fixture Karahi Hous (typo)");
    const result = await createFromCandidate(admin, await form(c.id));

    const restaurant = await db.restaurant.findUniqueOrThrow({
      where: { id: result.restaurant.id },
    });
    expect(restaurant).toMatchObject({
      name: "Fixture Karahi House",
      address: "Jinnah Super, F-7 Markaz",
      website: "https://fixture-karahi.example",
      source: "OVERTURE",
      overtureId: c.overtureId,
      lat: F7.lat,
      lng: F7.lng,
      locationSource: "OVERTURE",
      slug: "fixture-karahi-house-f-7",
    });
    const dishes = await db.restaurantDish.findMany({
      where: { restaurantId: restaurant.id },
      include: { dish: true },
      orderBy: { dish: { slug: "asc" } },
    });
    expect(dishes.map((d) => [d.dish.slug, d.status, d.source, d.confidence])).toEqual([
      ["chicken-karahi", "CANDIDATE", "ADMIN", 0.4],
      ["haleem", "CANDIDATE", "ADMIN", 0.4],
    ]);
    expect(await db.overtureCandidate.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      status: "CREATED",
      restaurantId: restaurant.id,
      reviewedByUserId: admin.id,
    });

    await expect(createFromCandidate(admin, await form(c.id))).rejects.toMatchObject({
      code: "CANDIDATE_REVIEWED",
      status: 409,
    });
    const other = await candidate("Fixture Other");
    await expect(
      createFromCandidate(admin, await form(other.id, { dishSlugs: ["no-such-dish"] })),
    ).rejects.toMatchObject({ code: "DISH_NOT_FOUND" });
    expect(await db.restaurant.count()).toBe(1);
  });

  it("Create from a place without a real location leaves the location unknown", async () => {
    const c = await candidate("Fixture Unknown", { lat: null, lng: null, suggestedAreaId: null });
    const { restaurant } = await createFromCandidate(admin, await form(c.id, { dishSlugs: [] }));
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } })).toMatchObject({
      source: "OVERTURE",
      overtureId: c.overtureId,
      lat: null,
      lng: null,
      locationSource: null,
    });
  });

  it("Link fills a missing Overture id and location and never overwrites them", async () => {
    const bare = await makeRestaurant("Fixture Hand Added");
    const c1 = await candidate("Fixture Hand Added", { ...metresNorth(40) });
    const linked = await linkCandidate(admin, { candidateId: c1.id, restaurantId: bare.id });
    expect(linked).toMatchObject({ overtureIdSet: true, locationSet: true });
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: bare.id } })).toMatchObject({
      overtureId: c1.overtureId,
      lat: c1.lat,
      lng: c1.lng,
      locationSource: "OVERTURE",
      source: "MANUAL",
    });
    expect(await db.overtureCandidate.findUniqueOrThrow({ where: { id: c1.id } })).toMatchObject({
      status: "LINKED",
      restaurantId: bare.id,
    });

    const full = await makeRestaurant("Fixture Full", {
      overtureId: "08f-older-id",
      lat: 33.7,
      lng: 73.05,
      locationSource: "ADMIN",
    });
    const c2 = await candidate("Fixture Full");
    expect(await linkCandidate(admin, { candidateId: c2.id, restaurantId: full.id })).toMatchObject(
      {
        overtureIdSet: false,
        locationSet: false,
      },
    );
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: full.id } })).toMatchObject({
      overtureId: "08f-older-id",
      lat: 33.7,
      lng: 73.05,
      locationSource: "ADMIN",
    });

    await expect(
      linkCandidate(admin, { candidateId: c2.id, restaurantId: bare.id }),
    ).rejects.toMatchObject({
      code: "CANDIDATE_REVIEWED",
    });
    const gone = await makeRestaurant("Fixture Gone");
    await mergeRestaurants(admin, gone.id, full.id);
    const c3 = await candidate("Fixture Gone");
    await expect(
      linkCandidate(admin, { candidateId: c3.id, restaurantId: gone.id }),
    ).rejects.toMatchObject({
      code: "RESTAURANT_MERGED",
    });
  });

  it("Skip with an optional reason; Reopen puts it back in the list", async () => {
    const c = await candidate("Fixture Tyre Shop");
    await skipCandidate(admin, { candidateId: c.id, reason: "NOT_A_RESTAURANT" });
    expect(await db.overtureCandidate.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      status: "SKIPPED",
      skipReason: "NOT_A_RESTAURANT",
      reviewedByUserId: admin.id,
    });
    await expect(skipCandidate(admin, { candidateId: c.id })).rejects.toMatchObject({
      code: "CANDIDATE_REVIEWED",
    });
    await reopenCandidate(admin, c.id);
    expect(await db.overtureCandidate.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      status: "NEW",
      skipReason: null,
      reviewedByUserId: null,
      reviewedAt: null,
    });
    await expect(reopenCandidate(admin, c.id)).rejects.toMatchObject({
      code: "CANDIDATE_NOT_SKIPPED",
    });
    await skipCandidate(admin, { candidateId: c.id });
    expect(
      (await db.overtureCandidate.findUniqueOrThrow({ where: { id: c.id } })).skipReason,
    ).toBeNull();
    expect(await db.restaurant.count()).toBe(0);
  });
});
