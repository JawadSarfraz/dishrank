import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./tests/e2e/setup/constants";
import { testDatabaseUrl } from "./tests/setup/test-database";

const baseURL = `http://localhost:${E2E.port}`;
// The e2e server never touches the dev database: both URLs point at the test database, and
// testDatabaseUrl refuses any database whose name does not end in _test.
const testDatabase = testDatabaseUrl();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL, trace: "retain-on-failure" },
  // Chromium only (docs/09 Prompt 1), at a 360 px phone width with touch (CLAUDE.md rule 8).
  projects: [
    {
      name: "mobile-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // A production build on the test database: prepare (migrate, seed, empty, fixtures), build,
    // start. `next build` writes .next, never .next/dev, so a running `pnpm dev` is not disturbed.
    command: `pnpm exec tsx tests/e2e/setup/prepare.ts && pnpm exec next build && pnpm exec next start --port ${E2E.port}`,
    url: baseURL,
    // Always this server: one already running may use another database or auth secret.
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL: testDatabase,
      DIRECT_URL: testDatabase,
      BETTER_AUTH_SECRET: E2E.authSecret,
      BETTER_AUTH_URL: baseURL,
      NEXT_PUBLIC_SITE_URL: baseURL,
      // Required by a production server (src/env.ts); Google is never called in these tests.
      GOOGLE_CLIENT_ID: "e2e-google-client-id",
      GOOGLE_CLIENT_SECRET: "e2e-google-client-secret",
      CRON_SECRET: E2E.cronSecret,
      // Empty values win over .env: no admin bootstrap, no LLM, no photo uploads.
      ADMIN_EMAIL: "",
      ANTHROPIC_API_KEY: "",
      SUPABASE_S3_ENDPOINT: "",
      SUPABASE_S3_REGION: "",
      SUPABASE_S3_ACCESS_KEY_ID: "",
      SUPABASE_S3_SECRET_ACCESS_KEY: "",
    },
  },
});
