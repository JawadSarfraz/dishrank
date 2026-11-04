import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createOrReplace } from "@/server/services/rating.service";
import {
  cleanupUnusedUploads,
  signPhotoUpload,
  UPLOAD_CLEANUP,
} from "@/server/services/upload.service";
import { resetAppData } from "../../setup/db-reset";
import { actorOf, dishId, makeRestaurant, makeUser } from "../restaurants/fixtures";
import { fakeStorage } from "./fake-storage";

const photo = { kind: "dish-photo" as const, contentType: "image/webp" as const, sizeBytes: 3 };

describe("uploads: random paths, ownership in the database, nightly clean-up (Phase 6)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("a photo is the signer's only; files nothing used for 24 hours are deleted, used ones kept", async () => {
    const diner = await makeUser("Diner");
    const other = await makeUser("Other");
    const restaurant = await makeRestaurant("Cleanup Karahi");
    const storage = fakeStorage();
    const used = await signPhotoUpload(actorOf(diner), photo, storage.adapter);
    const unused = await signPhotoUpload(actorOf(diner), photo, storage.adapter);
    const fresh = await signPhotoUpload(actorOf(diner), photo, storage.adapter);
    for (const s of [used, unused, fresh]) {
      storage.objects[s.path.slice("dish-photos/".length)] = { size: 3, contentType: "image/webp" };
    }
    // Someone else cannot attach the diner's upload, although the path carries no user id.
    const karahi = await dishId("chicken-karahi");
    await expect(
      createOrReplace(
        actorOf(other),
        { restaurantId: restaurant.id, dishId: karahi, score: 8, photoPath: used.path },
        { storage: storage.adapter },
      ),
    ).rejects.toMatchObject({ code: "PHOTO_NOT_YOURS" });
    await createOrReplace(
      actorOf(diner),
      { restaurantId: restaurant.id, dishId: karahi, score: 8, photoPath: used.path },
      { storage: storage.adapter },
    );

    // Two of the three are a day old; one of those is on a rating.
    const old = new Date(Date.now() - UPLOAD_CLEANUP.unusedForMs - 60_000);
    await db.upload.updateMany({
      where: { path: { in: [used.path, unused.path] } },
      data: { createdAt: old },
    });
    const summary = await cleanupUnusedUploads(storage.adapter);
    expect(summary).toMatchObject({ checked: 1, deleted: 1, failed: 0 });
    expect(storage.removed).toEqual([unused.path.slice("dish-photos/".length)]);
    const left = await db.upload.findMany({ select: { path: true } });
    expect(left.map((u) => u.path).sort()).toEqual([fresh.path, used.path].sort());
    // Without storage nothing is deleted.
    expect(await cleanupUnusedUploads(null)).toMatchObject({ skipped: true, deleted: 0 });
  });
});
