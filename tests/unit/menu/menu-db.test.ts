import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/roles";
import {
  MENU_PARSE,
  parseMenuUpload,
  submitMenuUpload,
  type MenuParseDeps,
} from "@/server/services/menu.service";
import { resolveReviewItem } from "@/server/services/review.service";
import { signPhotoUpload } from "@/server/services/upload.service";
import { createMenuVision } from "@/server/vision";
import { resetAppData } from "../../setup/db-reset";
import { actorOf, dishId, makeDish, makeRestaurant, makeUser } from "../restaurants/fixtures";
import { fakeStorage } from "../storage/fake-storage";
import { fakeAnthropic } from "./fake-anthropic";

const NOW = new Date();
const MENU = {
  sections: [
    {
      name: "Karahi",
      items: [
        { name: "Chicken Karahi Half", price: 1100, note: null },
        { name: "Chicken Karahi Full", price: 2000, note: null },
        { name: "White Chicken Karahi Full", price: 2200, note: null },
        { name: "Chikan Kadhai", price: 1900, note: null },
      ],
    },
    {
      name: "Fast food",
      items: [
        { name: "Beef Smash Burger", price: 1200, note: null },
        { name: "Raita", price: 150, note: null },
      ],
    },
  ],
};

let admin: SessionUser;

/** A restaurant with one PENDING upload whose photo is in the fake storage. */
async function pendingUpload() {
  const restaurant = await makeRestaurant("Menu Karahi House");
  const panel = await makeUser("Panel", { isPanel: true });
  const key = `${restaurant.id}/${panel.id}/${"a".repeat(32)}.webp`;
  const storage = fakeStorage({ [key]: { size: 3, contentType: "image/webp" } });
  const upload = await db.menuUpload.create({
    data: { restaurantId: restaurant.id, uploadedByUserId: panel.id, filePath: `menus/${key}` },
  });
  return { restaurant, panel, upload, storage };
}

function deps(storage: ReturnType<typeof fakeStorage>, answer: unknown = MENU) {
  const anthropic = fakeAnthropic(answer);
  const d: MenuParseDeps = {
    storage: storage.adapter,
    vision: createMenuVision({ model: "test-vision", client: anthropic.client }),
    llm: () => null, // matcher LLM step off: alias and trigram only
  };
  return { d, calls: anthropic.calls };
}

describe("menu photos → dishes (docs/07 §3)", () => {
  beforeEach(async () => {
    await resetAppData();
    admin = actorOf(await makeUser("Admin", { role: "ADMIN" }));
  });
  afterAll(() => db.$disconnect());

  it("matches ≥ 0.85 to MENU_VERIFIED rows, sends the rest to review, records the tokens", async () => {
    const { restaurant, upload, storage } = await pendingUpload();
    // An owner-verified row keeps the owner's name and price; a menu only marks it seen again.
    const burger = await makeDish(restaurant, "beef-burger", {
      status: "OWNER_VERIFIED",
      price: 999,
      menuName: "Owner Burger",
    });
    const { d } = deps(storage);

    const result = await parseMenuUpload(upload.id, { trigger: "cli", now: NOW }, d);
    expect(result).toMatchObject({ status: "PARSED", items: 6, matched: 4, needsReview: 2 });

    const karahi = await db.restaurantDish.findUniqueOrThrow({
      where: {
        restaurantId_dishId: {
          restaurantId: restaurant.id,
          dishId: await dishId("chicken-karahi"),
        },
      },
    });
    // Half and Full are two items; the row takes the lowest price and the first name.
    expect(karahi).toMatchObject({
      status: "MENU_VERIFIED",
      source: "MENU_PHOTO",
      menuName: "Chicken Karahi Half",
      price: 1100,
      variantTags: ["white"],
      lastVerifiedAt: NOW,
    });
    expect(await db.restaurantDish.findUniqueOrThrow({ where: { id: burger.id } })).toMatchObject({
      status: "OWNER_VERIFIED",
      price: 999,
      menuName: "Owner Burger",
      lastVerifiedAt: NOW,
    });

    const items = await db.menuItem.findMany({
      where: { menuUploadId: upload.id },
      include: { reviewItem: true },
    });
    const byName = new Map(items.map((i) => [i.rawName, i]));
    expect(byName.get("Chicken Karahi Full")).toMatchObject({
      status: "MATCHED",
      matchMethod: "ALIAS",
      matchConfidence: 1,
      reviewItemId: null,
    });
    // Trigram 0.53 (a typo): review with the suggestion; Raita: review without one.
    const typo = byName.get("Chikan Kadhai")!;
    expect(typo).toMatchObject({ status: "NEEDS_REVIEW", matchMethod: "TRIGRAM" });
    expect(typo.reviewItem).toMatchObject({
      type: "UNMATCHED_MENU_ITEM",
      status: "OPEN",
      restaurantId: restaurant.id,
      payload: {
        menuItemId: typo.id,
        rawName: "Chikan Kadhai",
        rawPrice: 1900,
        suggestions: [{ dishSlug: "chicken-karahi" }],
      },
    });
    expect(byName.get("Raita")!.reviewItem!.payload).toMatchObject({ suggestions: [] });

    expect(await db.menuUpload.findUniqueOrThrow({ where: { id: upload.id } })).toMatchObject({
      status: "PARSED",
      parsedAt: NOW,
      error: null,
      rawJson: MENU,
    });
    expect(
      await db.menuParse.findFirstOrThrow({ where: { menuUploadId: upload.id } }),
    ).toMatchObject({
      ok: true,
      trigger: "cli",
      model: "test-vision",
      inputTokens: 2500,
      outputTokens: 400,
    });
    // A parsed upload is not read twice.
    await expect(parseMenuUpload(upload.id, { trigger: "cli" }, d)).rejects.toMatchObject({
      code: "MENU_ALREADY_PARSED",
    });
  });

  it("assign and ignore resolve the items; the last one marks the upload REVIEWED", async () => {
    const { restaurant, upload, storage } = await pendingUpload();
    await parseMenuUpload(upload.id, { trigger: "cli", now: NOW }, deps(storage).d);
    const item = (name: string) =>
      db.menuItem.findFirstOrThrow({ where: { menuUploadId: upload.id, rawName: name } });
    const typo = await item("Chikan Kadhai");
    const raita = await item("Raita");

    const assigned = await resolveReviewItem(admin, typo.reviewItemId!, {
      action: "assign_dish",
      payload: { dishId: await dishId("chicken-karahi") },
    });
    expect(assigned).toMatchObject({ status: "RESOLVED", resolution: "assigned chicken-karahi" });
    expect(await item("Chikan Kadhai")).toMatchObject({
      status: "MATCHED",
      matchMethod: "HUMAN",
      matchConfidence: 1,
    });
    // The row still takes the lowest price of the upload's chicken karahi items.
    expect(
      await db.restaurantDish.findUniqueOrThrow({
        where: {
          restaurantId_dishId: {
            restaurantId: restaurant.id,
            dishId: await dishId("chicken-karahi"),
          },
        },
      }),
    ).toMatchObject({ status: "MENU_VERIFIED", price: 1100 });
    expect((await db.menuUpload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe(
      "PARSED",
    );

    await resolveReviewItem(admin, raita.reviewItemId!, { action: "ignore", payload: {} });
    expect((await item("Raita")).status).toBe("IGNORED");
    expect((await db.menuUpload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe(
      "REVIEWED",
    );
    await expect(
      resolveReviewItem(admin, raita.reviewItemId!, { action: "ignore", payload: {} }),
    ).rejects.toMatchObject({ code: "ITEM_CLOSED" });
  });

  it("stops at 50 parses in 24 hours before calling Anthropic; parsing off leaves uploads waiting", async () => {
    const { upload, storage } = await pendingUpload();
    const other = await pendingUpload();
    const recent = (i: number) => new Date(NOW.getTime() - (i + 1) * 60_000);
    await db.menuParse.createMany({
      data: [
        ...Array.from({ length: MENU_PARSE.dailyCap }, (_, i) => ({
          menuUploadId: other.upload.id,
          trigger: "cron",
          model: "m",
          startedAt: recent(i),
          finishedAt: recent(i),
          ok: true,
        })),
        // Older than 24 hours: not counted.
        { menuUploadId: other.upload.id, trigger: "cron", model: "m", startedAt: new Date(0) },
      ],
    });
    const { d, calls } = deps(storage);
    await expect(
      parseMenuUpload(upload.id, { trigger: "admin", now: NOW }, d),
    ).rejects.toMatchObject({ code: "DAILY_CAP_REACHED", status: 429 });
    expect(calls).toHaveLength(0);

    await expect(
      parseMenuUpload(upload.id, { trigger: "admin", now: NOW }, { ...d, vision: null }),
    ).rejects.toMatchObject({ code: "PARSING_DISABLED", status: 503 });
    expect((await db.menuUpload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe(
      "PENDING",
    );

    // One slot frees up: the parse runs.
    await db.menuParse.deleteMany({ where: { startedAt: recent(0) } });
    const result = await parseMenuUpload(upload.id, { trigger: "admin", now: NOW }, d);
    expect(result.status).toBe("PARSED");
    expect(calls).toHaveLength(1);
  });

  it("only panel members, the owner and admins upload menus, into their own folder", async () => {
    const restaurant = await makeRestaurant("Upload Place");
    const diner = actorOf(await makeUser("Diner"));
    const panel = actorOf(await makeUser("Panel", { isPanel: true }));
    const owner = actorOf(await makeUser("Owner", { role: "OWNER" }));
    await db.restaurant.update({
      where: { id: restaurant.id },
      data: { claimedByUserId: owner.id },
    });
    const storage = fakeStorage();
    const sign = (actor: SessionUser) =>
      signPhotoUpload(
        actor,
        { kind: "menu", restaurantId: restaurant.id, contentType: "image/webp", sizeBytes: 3 },
        storage.adapter,
      );

    await expect(sign(diner)).rejects.toMatchObject({ code: "MENU_UPLOAD_NOT_ALLOWED" });
    const signed = await sign(panel);
    expect(signed.path).toMatch(
      new RegExp(`^menus/${restaurant.id}/${panel.id}/[a-f0-9]{32}\\.webp$`),
    );
    expect(storage.calls.at(-1)?.bucket).toBe("menus");
    await expect(sign(owner)).resolves.toBeTruthy();
    await expect(sign(admin)).resolves.toBeTruthy();

    // Not uploaded yet, then someone else's path, then the real one.
    await expect(
      submitMenuUpload(panel, { restaurantId: restaurant.id, path: signed.path }, storage.adapter),
    ).rejects.toMatchObject({ code: "PHOTO_NOT_FOUND" });
    storage.objects[signed.path.slice("menus/".length)] = { size: 3, contentType: "image/webp" };
    await expect(
      submitMenuUpload(owner, { restaurantId: restaurant.id, path: signed.path }, storage.adapter),
    ).rejects.toMatchObject({ code: "PHOTO_NOT_YOURS" });
    const filed = await submitMenuUpload(
      panel,
      { restaurantId: restaurant.id, path: signed.path },
      storage.adapter,
    );
    expect(filed.status).toBe("PENDING");
    await expect(
      submitMenuUpload(panel, { restaurantId: restaurant.id, path: signed.path }, storage.adapter),
    ).rejects.toMatchObject({ code: "MENU_ALREADY_SUBMITTED" });
    await expect(
      submitMenuUpload(diner, { restaurantId: restaurant.id, path: signed.path }, storage.adapter),
    ).rejects.toMatchObject({ code: "MENU_UPLOAD_NOT_ALLOWED" });
  });
});
