// Runs before the e2e server is built (playwright.config.ts webServer command), on the test database
// only: migrate and seed, empty the app tables, then create what the specs need: a restaurant with
// Chicken Karahi on its list, a diner, and a real Better Auth session for that diner. The specs set
// its signed cookie, exactly what Google sign-in would have set; the app has no sign-in bypass.
import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prepareTestDatabase } from "../../setup/prepare-test-database";
import { assertTestDatabaseName, databaseName } from "../../setup/test-database";
import { E2E, type E2EFixture } from "./constants";

/** Better Auth's signed cookie value: `token.base64(HMAC-SHA256(secret, token))`, URI-encoded. */
export function signedSessionCookie(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  // playwright.config.ts points both variables at the test database; anything else is refused.
  assertTestDatabaseName(databaseName(url));
  assertTestDatabaseName(databaseName(process.env.DIRECT_URL ?? ""));
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret !== E2E.authSecret) throw new Error("BETTER_AUTH_SECRET is not the e2e secret");
  await prepareTestDatabase(url);

  // Imported after the checks: the database client connects with DATABASE_URL on import.
  const { db } = await import("@/server/db");
  const { resetAppData } = await import("../../setup/db-reset");
  const { inTransaction } = await import("@/server/repositories/transaction");
  const { addAdminDishesTx, insertRestaurantTx } =
    await import("@/server/services/restaurant.service");
  try {
    await resetAppData();
    const area = await db.area.findFirstOrThrow({
      where: { slug: "f-7", city: { slug: "islamabad" } },
    });
    const karahi = await db.dish.findUniqueOrThrow({ where: { slug: "chicken-karahi" } });
    const restaurant = await inTransaction(async (tx) => {
      const created = await insertRestaurantTx(
        {
          name: E2E.restaurant,
          areaId: area.id,
          address: "Jinnah Super, F-7 Markaz",
          source: "MANUAL",
          location: null,
        },
        tx,
      );
      await addAdminDishesTx(created, [karahi.id], tx);
      return created;
    });
    const diner = await db.user.create({
      data: {
        email: "e2e-diner@test.local",
        name: "E2E Diner",
        emailVerified: true,
        createdAt: new Date(Date.now() - 30 * 86_400_000),
      },
    });
    const token = randomBytes(24).toString("base64url");
    await db.session.create({
      data: {
        token,
        userId: diner.id,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
        userAgent: "playwright",
      },
    });
    const fixture: E2EFixture = {
      // Over http Better Auth uses this name (no __Secure- prefix).
      cookie: { name: "better-auth.session_token", value: signedSessionCookie(token, secret) },
      restaurant: { name: restaurant.name, slug: restaurant.slug },
      dish: { name: karahi.name },
    };
    mkdirSync(dirname(E2E.fixtureFile), { recursive: true });
    writeFileSync(E2E.fixtureFile, JSON.stringify(fixture, null, 2));
    console.log(`e2e fixtures ready on ${databaseName(url)}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
