import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";

// Needs DATABASE_URL (local Postgres or the CI service container) with migrations applied.
describe("db", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("connects and sees the auth tables", async () => {
    expect(await db.user.count()).toBeGreaterThanOrEqual(0);
  });
});
