// The Phase 3 JSON routes (docs/06) against the test DB. Only the session lookup and revalidatePath
// are replaced (test-only mocks); every rule runs in the real services.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import type { SessionUser } from "@/server/roles";

let current: SessionUser | null = null;
vi.mock("@/server/auth", () => ({
  requireUser: async () => {
    if (!current) throw new AppError("UNAUTHENTICATED", "Sign in required", 401);
    return current;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { db } = await import("@/server/db");
const { revalidatePath } = await import("next/cache");
const ratings = await import("@/app/api/v1/ratings/route");
const ratingById = await import("@/app/api/v1/ratings/[id]/route");
const me = await import("@/app/api/v1/me/ratings/route");
const dishes = await import("@/app/api/v1/dishes/route");
const cities = await import("@/app/api/v1/cities/route");
const proposals = await import("@/app/api/v1/proposals/route");
const restaurantDishes = await import("@/app/api/v1/restaurant-dishes/route");
const locations = await import("@/app/api/v1/location-observations/route");
const { resetAppData } = await import("../../setup/db-reset");
const { actorOf, daysAgo, dishId, makeRestaurant, makeUser } =
  await import("../restaurants/fixtures");

const json = (body: unknown, type = "application/json") =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": type, "x-real-ip": "203.0.113.9" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (path: string) =>
  new Request(`http://localhost${path}`, { headers: { "x-real-ip": "203.0.113.10" } });

describe("Phase 3 routes (docs/06, test DB)", () => {
  beforeEach(async () => {
    await resetAppData();
    current = null;
    vi.mocked(revalidatePath).mockClear();
  });
  afterAll(() => db.$disconnect());

  it("POST /ratings: 401 signed out, 415 without JSON, 400 invalid, 201 then 200 on re-rating", async () => {
    const r = await makeRestaurant("Fixture Karahi House");
    const body = { restaurantId: r.id, dishId: await dishId("chicken-karahi"), score: 9 };
    expect((await ratings.POST(json(body))).status).toBe(401);

    current = actorOf(await makeUser("Diner", { createdAt: daysAgo(30) }));
    expect((await ratings.POST(json(body, "text/plain"))).status).toBe(415);
    expect((await ratings.POST(json("{oops"))).status).toBe(400);
    const invalid = await ratings.POST(json({ ...body, score: 11 }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });

    const created = await ratings.POST(json(body));
    expect(created.status).toBe(201);
    const first = (await created.json()).data;
    expect(first).toMatchObject({
      created: true,
      held: false,
      votes: 1,
      eligible: false,
      rank: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/islamabad/best-chicken-karahi`);
    expect(revalidatePath).toHaveBeenCalledWith(`/islamabad/r/${r.slug}`);

    const replaced = await ratings.POST(json({ ...body, score: 7 }));
    expect(replaced.status).toBe(200);
    expect((await replaced.json()).data).toMatchObject({
      ratingId: first.ratingId,
      created: false,
    });
  });

  it("POST /ratings: a held rating still answers 200 with held: true; owners get 403", async () => {
    const owner = await makeUser("Owner", { createdAt: daysAgo(30) });
    const r = await makeRestaurant("Fixture Owned", { claimedByUserId: owner.id });
    const body = { restaurantId: r.id, dishId: await dishId("haleem"), score: 8 };
    current = actorOf(owner);
    const own = await ratings.POST(json(body));
    expect(own.status).toBe(403);
    expect(await own.json()).toMatchObject({ error: { code: "OWNER_SELF_RATING" } });

    current = actorOf(await makeUser("Diner", { createdAt: daysAgo(30) }));
    const held = await ratings.POST(json({ ...body, comment: "call 0300-1234567" }));
    expect(held.status).toBe(201);
    expect((await held.json()).data).toMatchObject({ held: true, heldReason: "COMMENT" });
  });

  it("DELETE /ratings/:id and GET /me/ratings: own ratings only, paginated with nextCursor", async () => {
    const r = await makeRestaurant("Fixture Pages");
    const me1 = await makeUser("Me", { createdAt: daysAgo(30) });
    current = actorOf(me1);
    const ids: string[] = [];
    for (const slug of ["pizza", "broast", "chai"]) {
      const res = await ratings.POST(
        json({ restaurantId: r.id, dishId: await dishId(slug), score: 8 }),
      );
      ids.push((await res.json()).data.ratingId);
    }
    const page1 = await (await me.GET(get("/api/v1/me/ratings?limit=2"))).json();
    expect(page1.data).toHaveLength(2);
    expect(page1.nextCursor).toBe(page1.data[1].id);
    expect(page1.data[0]).toMatchObject({
      restaurant: { name: "Fixture Pages", active: true },
      status: "ACTIVE",
    });
    const page2 = await (
      await me.GET(get(`/api/v1/me/ratings?limit=2&cursor=${page1.nextCursor}`))
    ).json();
    expect(page2).toMatchObject({ nextCursor: null });
    expect(page2.data).toHaveLength(1);

    current = actorOf(await makeUser("Stranger", { createdAt: daysAgo(30) }));
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    expect((await ratingById.DELETE(get("/x"), ctx(ids[0]))).status).toBe(404);
    current = actorOf(me1);
    expect((await ratingById.DELETE(get("/x"), ctx(ids[0]))).status).toBe(200);
    expect(await db.rating.count()).toBe(2);
  });

  it("GET /dishes searches every spelling, Roman Urdu included; GET /cities lists areas", async () => {
    const kadai = (await (await dishes.GET(get("/api/v1/dishes?city=islamabad&q=kadai"))).json())
      .data;
    expect(kadai[0]).toMatchObject({
      slug: expect.stringMatching(/karahi/),
      isLaunch: true,
      eligibleCount: 0,
    });
    const biryani = (await (await dishes.GET(get("/api/v1/dishes?q=biryani"))).json()).data;
    expect(biryani[0].slug).toBe("chicken-biryani");
    const launch = (await (await dishes.GET(get("/api/v1/dishes?launchOnly=true"))).json()).data;
    expect(launch).toHaveLength(19);
    expect((await dishes.GET(get("/api/v1/dishes?city=lahore"))).status).toBe(404);
    const list = (await (await cities.GET(get("/api/v1/cities"))).json()).data;
    expect(list.map((c: { slug: string }) => c.slug)).toEqual(["islamabad", "rawalpindi"]);
    expect(list[0].areas.length).toBeGreaterThan(10);
  });

  it("POST /proposals, /restaurant-dishes and /location-observations", async () => {
    const r = await makeRestaurant("Fixture Misc");
    current = actorOf(await makeUser("Diner", { createdAt: daysAgo(30) }));
    const p = await proposals.POST(json({ type: "DISH", name: "Lahori Fish", restaurantId: r.id }));
    expect(p.status).toBe(201);
    const added = await restaurantDishes.POST(
      json({ restaurantId: r.id, dishId: await dishId("haleem") }),
    );
    expect(added.status).toBe(201);
    expect((await added.json()).data).toMatchObject({ status: "CANDIDATE", created: true });
    const notPanel = await locations.POST(
      json({ restaurantId: r.id, lat: 33.72, lng: 73.05, accuracyM: 10 }),
    );
    expect(notPanel.status).toBe(403);
  });
});
