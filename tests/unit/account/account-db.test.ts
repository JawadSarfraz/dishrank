import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { deleteMyAccount } from "@/server/services/account.service";
import { submitClaim } from "@/server/services/claim.service";
import { propose } from "@/server/services/proposal.service";
import { createOrReplace } from "@/server/services/rating.service";
import { signPhotoUpload } from "@/server/services/upload.service";
import { resetAppData } from "../../setup/db-reset";
import { actorOf, daysAgo, dishId, makeRestaurant, makeUser } from "../restaurants/fixtures";
import { fakeStorage } from "../storage/fake-storage";

const NOW = new Date();

describe("delete my account (Phase 6)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("removes ratings (recomputed), photos, sessions and the account; menus stay without the name", async () => {
    const user = await makeUser("Leaving", { createdAt: daysAgo(30, NOW) });
    const other = await makeUser("Staying", { createdAt: daysAgo(30, NOW) });
    const actor = actorOf(user);
    const restaurant = await makeRestaurant("Goodbye Karahi");
    const owned = await makeRestaurant("Their Place", { claimedByUserId: user.id });
    const karahi = await dishId("chicken-karahi");
    const storage = fakeStorage();

    const photo = await signPhotoUpload(
      actor,
      { kind: "dish-photo", contentType: "image/webp", sizeBytes: 3 },
      storage.adapter,
    );
    storage.objects[photo.path.slice("dish-photos/".length)] = {
      size: 3,
      contentType: "image/webp",
    };
    const mine = await createOrReplace(
      actor,
      { restaurantId: restaurant.id, dishId: karahi, score: 10, photoPath: photo.path },
      { storage: storage.adapter },
    );
    await createOrReplace(actorOf(other), {
      restaurantId: restaurant.id,
      dishId: karahi,
      score: 6,
    });
    await submitClaim(actor, {
      restaurantId: restaurant.id,
      phone: "03001234567",
      proofNote: "Sign",
    });
    await propose(actor, { type: "DISH", name: "Fixture Lassi Float" });
    await db.session.create({
      data: { token: "t-leaving", userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const menu = await db.menuUpload.create({
      data: { restaurantId: restaurant.id, uploadedByUserId: user.id, filePath: "menus/x/y.webp" },
    });

    await expect(
      deleteMyAccount(actor, { confirm: "delete" as never }, storage.adapter),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const result = await deleteMyAccount(actor, { confirm: "DELETE" }, storage.adapter);
    expect(result.deleted).toBe(true);

    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await db.rating.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.ownerClaim.count()).toBe(0);
    expect(
      await db.reviewItem.count({ where: { type: { in: ["OWNER_CLAIM", "DISH_PROPOSAL"] } } }),
    ).toBe(0);
    expect(await db.upload.count()).toBe(0);
    expect(
      await db.rateLimitBucket.count({ where: { key: { startsWith: `user:${user.id}:` } } }),
    ).toBe(0);
    // The photo file is gone; the menu stays without its uploader; their restaurant is unclaimed.
    expect(storage.removed).toEqual([photo.path.slice("dish-photos/".length)]);
    expect(await db.menuUpload.findUniqueOrThrow({ where: { id: menu.id } })).toMatchObject({
      uploadedByUserId: null,
    });
    expect(
      (await db.restaurant.findUniqueOrThrow({ where: { id: owned.id } })).claimedByUserId,
    ).toBeNull();
    // The dish row counts only the other diner now.
    expect(
      await db.restaurantDish.findUniqueOrThrow({ where: { id: mine.restaurantDishId } }),
    ).toMatchObject({ distinctRaters: 1, ratingCount: 1 });
  });

  it("an admin cannot delete their own account here", async () => {
    const admin = actorOf(await makeUser("Admin", { role: "ADMIN" }));
    await expect(deleteMyAccount(admin, { confirm: "DELETE" }, null)).rejects.toMatchObject({
      code: "ADMIN_ACCOUNT",
    });
    await expect(deleteMyAccount(null, { confirm: "DELETE" }, null)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});
