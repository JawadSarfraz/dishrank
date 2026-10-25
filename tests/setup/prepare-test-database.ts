// Creates the test database if it is missing, applies every migration and seeds the taxonomy (all
// idempotent). Used by the Vitest global setup and by the e2e server's prepare step.
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertTestDatabaseName, databaseName, maintenanceUrl } from "./test-database";

async function createDatabaseIfMissing(url: string): Promise<void> {
  const name = databaseName(url); // checked by assertTestDatabaseName: [a-z0-9_]+_test
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: maintenanceUrl(url) }),
  });
  try {
    const rows = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (rows.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
}

function run(args: string[], url: string): void {
  try {
    execFileSync("pnpm", ["exec", ...args], {
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      stdio: "pipe",
    });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? "";
    throw new Error(`test database setup failed: ${args.join(" ")}\n${stderr}`);
  }
}

export async function prepareTestDatabase(url: string): Promise<void> {
  assertTestDatabaseName(databaseName(url));
  await createDatabaseIfMissing(url);
  run(["prisma", "migrate", "deploy"], url);
  run(["tsx", "prisma/seed.ts"], url);
}
