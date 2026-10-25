import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { RateFlow } from "@/components/rate/RateFlow";
import { db } from "@/server/db";
import { createOrReplace } from "@/server/services/rating.service";
import { getRatePageData, type RatePageData } from "@/server/services/rate-page.service";
import { resetAppData } from "../../setup/db-reset";
import {
  actorOf,
  daysAgo,
  dishId,
  makeDish,
  makeRestaurant,
  makeUser,
} from "../restaurants/fixtures";

const render = (data: RatePageData) => renderToStaticMarkup(createElement(RateFlow, { data }));

describe("/rate (docs/08 Phase 3, test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("opens at the restaurant step without a restaurant in the URL", async () => {
    const data = await getRatePageData(null, {});
    expect(data).toMatchObject({
      signedIn: false,
      isPanel: false,
      citySlug: "islamabad",
      restaurant: null,
    });
    expect(data.launchDishes).toHaveLength(19);
    const html = render(data);
    expect(html).toContain("Where did you eat?");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Islamabad</);
  });

  it("a deep link opens the score step; signed out it asks for sign-in and keeps the step", async () => {
    const r = await makeRestaurant("Fixture Karahi House");
    await makeDish(r, "chicken-karahi", { status: "USER_CONFIRMED", distinctRaters: 2 });
    const data = await getRatePageData(null, { r: r.slug, d: "chicken-karahi" });
    expect(data.restaurant).toMatchObject({ id: r.id, citySlug: "islamabad", area: "F-7" });
    expect(data.restaurant?.dishes).toMatchObject([{ slug: "chicken-karahi", votes: 2 }]);
    const html = render(data);
    expect(html).toContain("How was it?");
    expect(html).toContain("Sign in to save your rating. You will come back to this step.");
    expect(html).not.toContain("Submit rating");
    expect(html).toContain('aria-label="10 out of 10"');
  });

  it("prefills an earlier rating for an edit; photo step only with storage; location button only for panel", async () => {
    const r = await makeRestaurant("Fixture Tikka");
    const user = await makeUser("Diner", { createdAt: daysAgo(30) });
    await createOrReplace(actorOf(user), {
      restaurantId: r.id,
      dishId: await dishId("chicken-tikka"),
      score: 7,
      comment: "smoky",
    });
    const data = await getRatePageData(actorOf(user), { r: r.slug, d: "chicken-tikka" });
    expect(data.existing).toMatchObject({ score: 7, comment: "smoky", status: "ACTIVE" });
    const html = render({ ...data, photosEnabled: false });
    expect(html).toContain("Update rating");
    expect(html).toContain("You rated this 7/10 before");
    expect(html).toMatch(/aria-pressed="true" aria-label="7 out of 10"/);
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("share location");
    expect(render({ ...data, photosEnabled: true })).toContain('type="file"');

    const panel = await makeUser("Panel", { isPanel: true, trustScore: 1.3 });
    const panelData = await getRatePageData(actorOf(panel), { r: r.slug, d: "chicken-tikka" });
    expect(panelData.isPanel).toBe(true);
    expect(render(panelData)).toContain("I&#x27;m at this restaurant now – share location");
  });
});
