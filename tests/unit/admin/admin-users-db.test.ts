import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listUsersForAdmin, setPanel } from "@/server/services/admin-users.service";
import { resetAppData } from "../../setup/db-reset";
import {
  ADMIN,
  USER,
  actorOf,
  daysAgo,
  makeDish,
  makeRating,
  makeRestaurant,
  makeUser,
} from "../restaurants/fixtures";

describe("/admin/users (test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("is for admins only", async () => {
    const u = await makeUser("Someone");
    await expect(listUsersForAdmin(USER, { page: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setPanel(actorOf(u), u.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setPanel(null, u.id, true)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("panel on fixes trust at 1.3 and recomputes the user's rows; off returns to the trust table", async () => {
    const rater = await makeUser("Rater");
    const r = await makeRestaurant("Fixture Panel Rows");
    const rd = await makeDish(r, "pizza", { status: "USER_CONFIRMED" });
    await makeRating(rd.id, rater.id, 9, new Date());

    const on = await setPanel(ADMIN, rater.id, true);
    expect(on).toMatchObject({ isPanel: true, trustScore: 1.3, recomputedRows: 1 });
    expect(
      (await db.restaurantDish.findUniqueOrThrow({ where: { id: rd.id } })).weightSum,
    ).toBeCloseTo(1.3, 3);

    const off = await setPanel(ADMIN, rater.id, false);
    expect(off).toMatchObject({ isPanel: false, trustScore: 0.6 }); // 1 rating, no photo
    expect(
      (await db.restaurantDish.findUniqueOrThrow({ where: { id: rd.id } })).weightSum,
    ).toBeCloseTo(0.6, 3);

    // 3 active ratings with a photo earn 1.0 at once.
    for (const slug of ["broast", "chai"]) {
      const row = await makeDish(r, slug);
      await makeRating(row.id, rater.id, 8, new Date(), {
        photoPath: `dish-photos/${rater.id}/${slug}.webp`,
      });
    }
    await setPanel(ADMIN, rater.id, true);
    expect(await setPanel(ADMIN, rater.id, false)).toMatchObject({ trustScore: 1.0 });
  });

  it("finds users by email or name and lists panel members", async () => {
    await makeUser("Amina Karahi", { email: "amina@test.local", createdAt: daysAgo(3) });
    await makeUser("Bilal", { email: "bilal@test.local", isPanel: true, trustScore: 1.3 });
    expect(
      (await listUsersForAdmin(ADMIN, { q: "AMINA", page: 1 })).items.map((u) => u.name),
    ).toEqual(["Amina Karahi"]);
    expect(
      (await listUsersForAdmin(ADMIN, { panel: "only", page: 1 })).items.map((u) => u.name),
    ).toEqual(["Bilal"]);
  });
});
