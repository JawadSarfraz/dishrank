import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as bySlug } from "@/app/api/v1/restaurants/[slug]/route";
import { GET as search } from "@/app/api/v1/restaurants/search/route";
import { db } from "@/server/db";
import { mergeRestaurants } from "@/server/services/restaurant.service";
import { resetAppData } from "../../setup/db-reset";
import { ADMIN, makeDish, makeRestaurant } from "../restaurants/fixtures";

const get = (path: string, ip = "203.0.113.5") =>
  new Request(`http://localhost${path}`, { headers: { "x-real-ip": ip } });
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("restaurant API (docs/06, test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it('GET /restaurants/search?q=but karahi returns "Butt Karahi"', async () => {
    const butt = await makeRestaurant("Butt Karahi", { address: "Plot 5, Fixture Market" });
    const res = await search(get("/api/v1/restaurants/search?city=islamabad&q=but%20karahi"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [
        {
          id: butt.id,
          slug: butt.slug,
          name: "Butt Karahi",
          area: "F-7",
          address: "Plot 5, Fixture Market",
        },
      ],
    });
  });

  it("validates the query and the city", async () => {
    const missing = await search(get("/api/v1/restaurants/search?city=islamabad"));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    const unknown = await search(get("/api/v1/restaurants/search?city=lahore&q=karahi"));
    expect(unknown.status).toBe(404);
  });

  it("rate-limits search to 120 a minute per IP", async () => {
    for (let i = 0; i < 120; i++) {
      expect(
        (await search(get("/api/v1/restaurants/search?city=islamabad&q=x", "198.51.100.1"))).status,
      ).toBe(200);
    }
    const limited = await search(
      get("/api/v1/restaurants/search?city=islamabad&q=x", "198.51.100.1"),
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(
      (await search(get("/api/v1/restaurants/search?city=islamabad&q=x", "198.51.100.2"))).status,
    ).toBe(200);
  });

  it("GET /restaurants/:slug returns the restaurant with its dishes", async () => {
    const r = await makeRestaurant("Fixture Pulao House", {
      lat: 33.7215,
      lng: 73.0569,
      locationSource: "OVERTURE",
    });
    await makeDish(r, "chicken-pulao", { distinctRaters: 2 });
    await makeDish(r, "chicken-karahi", { status: "USER_CONFIRMED", rankInCity: 3, score: 8.1 });
    await makeDish(r, "haleem", { status: "REMOVED" });
    const res = await bySlug(get(`/api/v1/restaurants/${r.slug}`), ctx(r.slug));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.restaurant).toMatchObject({
      id: r.id,
      name: "Fixture Pulao House",
      area: { slug: "f-7" },
      lat: 33.7215, // our own coordinates (Overture or admin), for distance
      lng: 73.0569,
      website: null,
    });
    expect(body.data.restaurant).not.toHaveProperty("locationSource");
    expect(body.data.claimed).toBe(false);
    expect(body.data.dishes.map((d: { dish: { slug: string } }) => d.dish.slug)).toEqual([
      "chicken-karahi",
      "chicken-pulao",
    ]);
    expect(body.data.dishes[0]).toMatchObject({ score: 8.1, rankInCity: 3, votes: 0 });
  });

  it("answers 301 for a merged restaurant and 404 for unknown slugs", async () => {
    const old = await makeRestaurant("Old Name");
    const survivor = await makeRestaurant("New Name");
    await mergeRestaurants(ADMIN, old.id, survivor.id);
    const res = await bySlug(get(`/api/v1/restaurants/${old.slug}`), ctx(old.slug));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      `http://localhost/api/v1/restaurants/${survivor.slug}`,
    );
    expect((await bySlug(get("/api/v1/restaurants/nope"), ctx("nope"))).status).toBe(404);
    expect((await bySlug(get("/api/v1/restaurants/Bad_Slug"), ctx("Bad_Slug"))).status).toBe(404);
  });
});
