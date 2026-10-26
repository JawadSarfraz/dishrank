// /rate page data: who may save and who sees the panel location button is decided on the server.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getRatePageData } from "@/server/services/rate-page.service";
import { resetAppData } from "../../setup/db-reset";
import { actorOf, makeDish, makeRestaurant, makeUser } from "../restaurants/fixtures";

describe("/rate page data (test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("a deep link opens the step for anyone; saving needs a session; panel comes from the database", async () => {
    const r = await makeRestaurant("Fixture Karahi House");
    await makeDish(r, "chicken-karahi", { status: "USER_CONFIRMED", distinctRaters: 2 });
    const step = { r: r.slug, d: "chicken-karahi" };
    expect(await getRatePageData(null, step)).toMatchObject({
      signedIn: false,
      isPanel: false,
      restaurant: { id: r.id, citySlug: "islamabad" },
      dish: { slug: "chicken-karahi" },
    });
    const diner = await makeUser("Diner");
    expect(await getRatePageData(actorOf(diner), step)).toMatchObject({
      signedIn: true,
      isPanel: false,
    });
    const panel = await makeUser("Panel", { isPanel: true, trustScore: 1.3 });
    expect((await getRatePageData(actorOf(panel), step)).isPanel).toBe(true);
  });
});
