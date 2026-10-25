// Vitest global setup: create the test database if it is missing, apply every migration and seed
// the taxonomy (both idempotent). Each test file that writes resets the app tables itself.
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { databaseName, maintenanceUrl, testDatabaseUrl } from "./test-database";

async function createDatabaseIfMissing(url: string): Promise<void> {
  const name = databaseName(url); // checked by testDatabaseUrl: [a-z0-9_]+_test
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: maintenanceUrl(url) }),
  });
  try {
    const rows = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${name}`;
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

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  await createDatabaseIfMissing(url);
  run(["prisma", "migrate", "deploy"], url);
  run(["tsx", "prisma/seed.ts"], url);
}
