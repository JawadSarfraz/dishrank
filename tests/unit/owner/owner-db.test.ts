import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  getOwnerRestaurant,
  listMyRestaurants,
  updateOwnerDish,
} from "@/server/services/owner.service";
import { resetAppData } from "../../setup/db-reset";
import { actorOf, makeDish, makeRestaurant, makeUser } from "../restaurants/fixtures";

describe("owner area (docs/07 §4 step 3)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("confirms, fixes and removes dishes of their own restaurant only; sees ranks, never raters", async () => {
    const owner = actorOf(await makeUser("Owner", { role: "OWNER" }));
    const restaurant = await makeRestaurant("Owner Karahi", { claimedByUserId: owner.id });
    const karahi = await makeDish(restaurant, "chicken-karahi", { status: "CANDIDATE" });
    const tikka = await makeDish(restaurant, "chicken-tikka", {
      status: "MENU_VERIFIED",
      price: 500,
    });
    const chai = await makeDish(restaurant, "chai", { status: "USER_CONFIRMED" });

    expect((await listMyRestaurants(owner)).map((r) => r.id)).toEqual([restaurant.id]);
    await updateOwnerDish(owner, karahi.id, { action: "confirm" });
    await updateOwnerDish(owner, tikka.id, { action: "edit", menuName: "Tikka Leg", price: 550 });
    await updateOwnerDish(owner, chai.id, { action: "remove", reason: "No tea any more" });
    const rows = await db.restaurantDish.findMany({ where: { restaurantId: restaurant.id } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(karahi.id)).toMatchObject({ status: "OWNER_VERIFIED" });
    expect(byId.get(tikka.id)).toMatchObject({
      status: "OWNER_VERIFIED",
      menuName: "Tikka Leg",
      price: 550,
    });
    expect(byId.get(chai.id)).toMatchObject({ status: "REMOVED" });
    await expect(updateOwnerDish(owner, chai.id, { action: "confirm" })).rejects.toMatchObject({
      code: "DISH_REMOVED",
    });

    // A snapshot that ranked the karahi shows in its weekly history.
    await db.rankingSnapshot.create({
      data: {
        cityId: restaurant.cityId,
        dishId: karahi.dishId,
        computedAt: new Date(Date.now() - 86_400_000),
        payload: [{ restaurantDishId: karahi.id, rank: 3, score: 7.4, votes: 9 }],
      },
    });
    const page = await getOwnerRestaurant(owner, restaurant.id);
    expect(page.removed.map((d) => d.id)).toEqual([chai.id]);
    const k = page.dishes.find((d) => d.id === karahi.id)!;
    expect(k.history).toMatchObject([{ rank: 3, score: 7.4, votes: 9 }]);
    // Aggregates only: nothing about ratings or raters.
    expect(Object.keys(k).sort()).toEqual(
      [
        "dish",
        "distinctRaters",
        "history",
        "id",
        "lastVerifiedAt",
        "menuName",
        "price",
        "rankInCity",
        "score",
        "status",
        "variantTags",
      ].sort(),
    );

    // Someone else's restaurant: not found; a diner: forbidden.
    const other = await makeRestaurant("Not Theirs");
    const otherDish = await makeDish(other, "chai");
    await expect(getOwnerRestaurant(owner, other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateOwnerDish(owner, otherDish.id, { action: "confirm" })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    const diner = actorOf(await makeUser("Diner"));
    await expect(listMyRestaurants(diner)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
