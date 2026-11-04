import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/roles";
import { listMyClaims, removeRestaurantOwner, submitClaim } from "@/server/services/claim.service";
import { listMyRestaurants } from "@/server/services/owner.service";
import { createOrReplace } from "@/server/services/rating.service";
import { resolveReviewItem } from "@/server/services/review.service";
import { ownerRemoveInput, parseInput } from "@/server/validation";
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

describe("removing an owner (/admin/restaurants)", () => {
  let admin: SessionUser;
  beforeEach(async () => {
    await resetAppData();
    admin = actorOf(await makeUser("Admin", { role: "ADMIN" }));
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => db.$disconnect());

  const reason = "Called the number: they do not run this restaurant";

  it("unclaims the restaurant, takes the OWNER role back, and the normal rating rules apply again", async () => {
    const restaurant = await makeRestaurant("Removal Karahi");
    const owner = await makeUser("Owner", { createdAt: daysAgo(30, NOW) });
    const diner = await makeUser("Diner", { createdAt: daysAgo(30, NOW) });
    const karahi = await dishId("chicken-karahi");
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
    const claim = await submitClaim(actorOf(owner), claimOf(restaurant.id));
    await resolveReviewItem(admin, (await itemOf(claim.id)).id, { action: "approve" }, NOW);
    const asOwner = actorOf({ ...owner, role: "OWNER" });
    const row = () =>
      db.restaurantDish.findUniqueOrThrow({ where: { id: rated.restaurantDishId } });
    expect(await row()).toMatchObject({ distinctRaters: 1 }); // the owner's rating does not count

    // Only an admin, and only the owner the page showed.
    await expect(
      removeRestaurantOwner(asOwner, restaurant.id, { ownerId: owner.id, reason }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      removeRestaurantOwner(null, restaurant.id, { ownerId: owner.id, reason }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(
      removeRestaurantOwner(admin, restaurant.id, { ownerId: diner.id, reason }),
    ).rejects.toMatchObject({ code: "ITEM_CHANGED" });

    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await removeRestaurantOwner(
      admin,
      restaurant.id,
      { ownerId: owner.id, reason },
      NOW,
    );
    expect(result).toMatchObject({ id: restaurant.id, ownerRoleRemoved: true });
    expect(result.dishPages).toEqual([expect.objectContaining({ dishSlug: "chicken-karahi" })]);
    const line = log.mock.calls
      .map(([text]) => JSON.parse(String(text)))
      .find((l) => l.action === "admin.restaurant.owner_remove");
    expect(line).toMatchObject({
      userId: admin.id,
      entityId: restaurant.id,
      ownerId: owner.id,
      roleRemoved: true,
      reason,
    });

    expect(await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } })).toMatchObject({
      claimedByUserId: null,
      claimedAt: null,
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).role).toBe("USER");
    // Their earlier rating counts again, and they may rate the restaurant again.
    expect(await row()).toMatchObject({ distinctRaters: 2, ratingCount: 2 });
    await expect(
      createOrReplace(actorOf(owner), { restaurantId: restaurant.id, dishId: karahi, score: 9 }),
    ).resolves.toMatchObject({ votes: 2 });
    // /me no longer calls them the manager; a second removal finds no owner.
    expect(await listMyClaims(actorOf(owner))).toMatchObject([
      { status: "APPROVED", managing: false },
    ]);
    await expect(
      removeRestaurantOwner(admin, restaurant.id, { ownerId: owner.id, reason }),
    ).rejects.toMatchObject({ code: "NOT_CLAIMED" });
    // Anyone may claim it again.
    await expect(submitClaim(actorOf(diner), claimOf(restaurant.id))).resolves.toMatchObject({
      status: "PENDING",
    });
  });

  it("keeps the OWNER role while another restaurant (even a closed one) is theirs; an admin stays ADMIN", async () => {
    const owner = await makeUser("Two Places", { role: "OWNER" });
    const first = await makeRestaurant("Owned One", { claimedByUserId: owner.id });
    const closed = await makeRestaurant("Owned Two", {
      claimedByUserId: owner.id,
      status: "CLOSED",
    });
    const asOwner = actorOf(owner);
    const one = await removeRestaurantOwner(admin, first.id, { ownerId: owner.id, reason }, NOW);
    expect(one.ownerRoleRemoved).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).role).toBe("OWNER");
    expect((await listMyRestaurants(asOwner)).map((r) => r.id)).toEqual([closed.id]);
    const two = await removeRestaurantOwner(admin, closed.id, { ownerId: owner.id, reason }, NOW);
    expect(two.ownerRoleRemoved).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).role).toBe("USER");

    const adminOwner = await makeUser("Admin Owner", { role: "ADMIN" });
    const theirs = await makeRestaurant("Admin Place", { claimedByUserId: adminOwner.id });
    const kept = await removeRestaurantOwner(
      admin,
      theirs.id,
      { ownerId: adminOwner.id, reason },
      NOW,
    );
    expect(kept.ownerRoleRemoved).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: adminOwner.id } })).role).toBe("ADMIN");
  });

  it("needs a reason of at most 500 characters", () => {
    for (const bad of [undefined, "", "   ", "x".repeat(501)]) {
      expect(() => parseInput(ownerRemoveInput, { ownerId: "abcdefgh12", reason: bad })).toThrow(
        expect.objectContaining({ code: "VALIDATION_FAILED" }),
      );
    }
    expect(parseInput(ownerRemoveInput, { ownerId: "abcdefgh12", reason: `  ${reason} ` })).toEqual(
      { ownerId: "abcdefgh12", reason },
    );
  });
});
