// Shared by playwright.config.ts, the prepare step and the specs (no database imports here).

export const E2E = {
  port: 3100,
  /**
   * Signs session cookies of the e2e server only, which runs on the test database. A fixed value,
   * so the prepare step can sign a real session the same way Better Auth does; it is never a
   * production or development secret.
   */
  authSecret: "e2e-only-auth-secret-for-the-test-database-0001",
  cronSecret: "e2e-only-cron-secret-for-the-test-database-0001",
  ipHashSecret: "e2e-only-ip-hash-secret-for-the-test-database-01",
  /** Written by the prepare step, read by the specs; gitignored. */
  fixtureFile: "playwright/.auth/e2e-fixture.json",
  restaurant: "E2E Karahi House",
  dish: "Chicken Karahi",
  /** The ranking-page journey: Pizza in Islamabad, one ranked restaurant and one without votes. */
  ranked: "E2E Pizza Point",
  unranked: "E2E Pizza Corner",
  /** The score that survives sign-in: Zinger Burger, listed here and rated by nobody else. */
  quickRated: "E2E Zinger Stop",
  /** The menu journey: a parsed menu photo with items waiting for an admin. */
  menuRestaurant: "E2E Menu Grill",
} as const;

export type E2EFixture = {
  cookie: { name: string; value: string };
  /** A real session of an admin (role ADMIN), signed like the diner's. */
  adminCookie: { name: string; value: string };
  menuUploadId: string;
  restaurant: { name: string; slug: string };
  dish: { name: string };
  quickRated: { name: string };
  pizza: { ranked: { name: string; slug: string }; unranked: { name: string; slug: string } };
};
