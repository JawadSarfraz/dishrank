// Vitest global setup: create the test database if it is missing, apply every migration and seed
// the taxonomy (both idempotent). Each test file that writes resets the app tables itself.
import "dotenv/config";
import { prepareTestDatabase } from "./prepare-test-database";
import { testDatabaseUrl } from "./test-database";

export default async function setup(): Promise<void> {
  await prepareTestDatabase(testDatabaseUrl());
}
