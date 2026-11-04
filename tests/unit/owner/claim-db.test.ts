import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/roles";
import { listMyClaims, submitClaim } from "@/server/services/claim.service";
import { createOrReplace } from "@/server/services/rating.service";
import { resolveReviewItem } from "@/server/services/review.service";
import { resetAppData } from "../../setup/db-reset";
import { actorOf, daysAgo, dishId, makeRestaurant, makeUser } from "../restaurants/fixtures";

const NOW = new Date();
const claimOf = (restaurantId: string) => ({
  restaurantId,
  phone: "0300 1234567",
  proofNote: "Call the number on our signboard",
});
const itemOf = (claimId: string) =>
  db.reviewItem.findFirstOrThrow({
    where: { type: "OWNER_CLAIM", payload: { path: ["claimId"], equals: claimId } },
  });

describe("owner claims (docs/07 §4)", () => {
  let admin: SessionUser;
  beforeEach(async () => {
    await resetAppData();
    admin = actorOf(await makeUser("Admin", { role: "ADMIN" }));
  });
  afterAll(() => db.$disconnect());

  it("approving makes a USER the OWNER; they can no longer rate there and earlier ratings stop counting", async () => {
    const restaurant = await makeRestaurant("Claim Karahi");
    const owner = await makeUser("Owner", { createdAt: daysAgo(30, NOW) });
    const diner = await makeUser("Diner", { createdAt: daysAgo(30, NOW) });
    const karahi = await dishId("chicken-karahi");
    // The future owner rated their own place before claiming it.
    await createOrReplace(actorOf(owner), {
      restaurantId: restaurant.id,
      dishId: karahi,
      score: 10,
    });
    const rated = await createOrReplace(actorOf(diner), {
      restaurantId: restaurant.id,
      dishId: karahi,
      score: 6,
    });
    expect(rated.votes).toBe(2);

    const claim = await submitClaim(actorOf(owner), claimOf(restaurant.id));
    expect(claim).toMatchObject({ status: "PENDING", duplicate: false });
    // The same claim again files nothing new.
    expect(await submitClaim(actorOf(owner), claimOf(restaurant.id))).toMatchObject({
      id: claim.id,
      duplicate: true,
    });
    const item = await itemOf(claim.id);
    expect(item).toMatchObject({ restaurantId: restaurant.id, createdByUserId: owner.id });

    await resolveReviewItem(admin, item.id, { action: "approve" }, NOW);
    expect(await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } })).toMatchObject({
      claimedByUserId: owner.id,
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      role: "OWNER",
    });
    expect(await db.ownerClaim.findUniqueOrThrow({ where: { id: claim.id } })).toMatchObject({
      status: "APPROVED",
      reviewedByUserId: admin.id,
    });
    // Only the diner's rating counts now.
    const row = await db.restaurantDish.findUniqueOrThrow({
      where: { id: rated.restaurantDishId },
    });
    expect(row).toMatchObject({ distinctRaters: 1, ratingCount: 1 });
    await expect(
      createOrReplace(actorOf({ ...owner, role: "OWNER" }), {
        restaurantId: restaurant.id,
        dishId: karahi,
        score: 9,
      }),
    ).rejects.toMatchObject({ code: "OWNER_SELF_RATING" });
    // Someone else cannot claim it any more.
    await expect(submitClaim(actorOf(diner), claimOf(restaurant.id))).rejects.toMatchObject({
      code: "RESTAURANT_CLAIMED",
    });
  });

  it("a rejection needs a reason, which the claimant sees; an admin claimant stays ADMIN", async () => {
    const restaurant = await makeRestaurant("Claim Tikka");
    const user = await makeUser("Claimant");
    const claim = await submitClaim(actorOf(user), claimOf(restaurant.id));
    const item = await itemOf(claim.id);
    await expect(
      resolveReviewItem(admin, item.id, { action: "reject", payload: {} }, NOW),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await resolveReviewItem(
      admin,
      item.id,
      { action: "reject", payload: { reason: "The number belongs to another restaurant" } },
      NOW,
    );
    expect(await listMyClaims(actorOf(user))).toMatchObject([
      { status: "REJECTED", rejectReason: "The number belongs to another restaurant" },
    ]);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("USER");

    const other = await makeRestaurant("Claim Biryani");
    const adminClaim = await submitClaim(admin, claimOf(other.id));
    await resolveReviewItem(admin, (await itemOf(adminClaim.id)).id, { action: "approve" }, NOW);
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe("ADMIN");
    await expect(submitClaim(null, claimOf(other.id))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});
