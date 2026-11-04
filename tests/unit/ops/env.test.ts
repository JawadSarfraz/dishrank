import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeEnvProblems, parseEnv, validVariables } from "@/env";
import { SUPABASE_ROOT_CA_2021, sslOptionFor } from "@/server/db-ssl";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u@localhost:5432/db",
  DIRECT_URL: "postgresql://u@localhost:5432/db",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  CRON_SECRET: "c".repeat(64),
  IP_HASH_SECRET: "i".repeat(64),
};

describe("env schema", () => {
  it("accepts a complete environment and fills defaults", () => {
    const result = parseEnv(valid);
    expect(result.success).toBe(true);
    expect(result.data?.SUPABASE_DISH_PHOTOS_BUCKET).toBe("dish-photos");
  });

  it("names every missing or malformed variable, treating blanks as missing", () => {
    const source = {
      ...valid,
      CRON_SECRET: "",
      IP_HASH_SECRET: undefined,
      BETTER_AUTH_SECRET: "short",
      DATABASE_URL: "mysql://x",
    };
    const result = parseEnv(source);
    expect(result.success).toBe(false);
    const text = describeEnvProblems(result.error!, source);
    expect(text).toContain("CRON_SECRET: missing");
    expect(text).toContain("IP_HASH_SECRET: missing");
    expect(text).toContain("BETTER_AUTH_SECRET: invalid (must be at least 32 characters)");
    expect(text).toContain("DATABASE_URL: invalid (must be a postgresql:// URL)");
    expect(text).not.toContain("short"); // values are never echoed
    expect(text).not.toContain("mysql");
  });

  it("keeps every valid variable when another one is malformed (development fallback)", () => {
    const kept = validVariables({ ...valid, SUPABASE_S3_ENDPOINT: "not a url", CRON_SECRET: "x" });
    expect(kept.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(kept.BETTER_AUTH_SECRET).toBe(valid.BETTER_AUTH_SECRET);
    expect(kept.SUPABASE_DISH_PHOTOS_BUCKET).toBe("dish-photos");
    expect(kept).not.toHaveProperty("SUPABASE_S3_ENDPOINT");
    expect(kept).not.toHaveProperty("CRON_SECRET");
  });

  it("Supabase: verified TLS from the app, so DATABASE_URL may not carry its own sslmode", () => {
    const pooled =
      "postgresql://postgres.ref:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
    expect(parseEnv({ ...valid, DATABASE_URL: pooled }).success).toBe(true);
    const modeSource = { ...valid, DATABASE_URL: `${pooled}&sslmode=require` };
    const withMode = parseEnv(modeSource);
    expect(withMode.success).toBe(false);
    const modeText = describeEnvProblems(withMode.error!, modeSource);
    expect(modeText).toContain("DATABASE_URL: invalid (remove sslmode");
    expect(modeText).not.toContain("pw@"); // never the URL or its password
    // DIRECT_URL is read only by the Prisma CLI, whose own TLS handles sslmode=require.
    const session = pooled.replace(":6543/", ":5432/").replace("pgbouncer=true", "sslmode=require");
    expect(parseEnv({ ...valid, DIRECT_URL: session }).success).toBe(true);
    expect(sslOptionFor(pooled)).toEqual({ ca: SUPABASE_ROOT_CA_2021 });
    expect(sslOptionFor("postgresql://postgres:pw@db.abcdefref.supabase.co:5432/postgres")).toEqual(
      {
        ca: SUPABASE_ROOT_CA_2021,
      },
    );
    expect(sslOptionFor("postgresql://u@localhost:5433/dishrank")).toBeUndefined();
    expect(sslOptionFor("postgresql://u:p@evilsupabase.com:5432/db")).toBeUndefined();
  });
});

// Deploy safety (2026-11-04): a deployment without a required variable went live and failed every
// request. The Vercel build now checks the production schema before anything else.
describe("scripts/vercel-build.ts", () => {
  it("stops before generating, migrating or building, naming only the bad variables", () => {
    const directUrl = "postgresql://builder:hunter2-password@db.invalid:5432/db";
    const ROOT = path.resolve(__dirname, "../../..");
    const run = spawnSync(
      path.join(ROOT, "node_modules", ".bin", "tsx"),
      ["scripts/vercel-build.ts"],
      {
        cwd: ROOT,
        // Only these variables, never the developer's .env or shell; IP_HASH_SECRET is left out.
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: "production",
          VERCEL_ENV: "production",
          DATABASE_URL: valid.DATABASE_URL,
          DIRECT_URL: directUrl,
          BETTER_AUTH_SECRET: valid.BETTER_AUTH_SECRET,
          BETTER_AUTH_URL: valid.BETTER_AUTH_URL,
          GOOGLE_CLIENT_ID: valid.GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET: valid.GOOGLE_CLIENT_SECRET,
          CRON_SECRET: "too-short-cron-value",
        },
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    const output = `${run.stdout}${run.stderr}`;
    expect(run.status).toBe(1);
    expect(output).toContain("IP_HASH_SECRET: missing");
    expect(output).toContain("CRON_SECRET: invalid (must be at least 32 characters)");
    expect(output).not.toContain("BETTER_AUTH_SECRET"); // valid ones are not listed
    for (const value of [
      "too-short-cron-value",
      directUrl,
      "hunter2",
      valid.DATABASE_URL,
      valid.BETTER_AUTH_SECRET,
    ]) {
      expect(output).not.toContain(value);
    }
    expect(output).not.toContain("Prisma schema loaded"); // prisma never ran
  });
});
