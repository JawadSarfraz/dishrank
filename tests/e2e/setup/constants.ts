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
  /** Written by the prepare step, read by the specs; gitignored. */
  fixtureFile: "playwright/.auth/e2e-fixture.json",
  restaurant: "E2E Karahi House",
  dish: "Chicken Karahi",
} as const;

export type E2EFixture = {
  cookie: { name: string; value: string };
  restaurant: { name: string; slug: string };
  dish: { name: string };
};
