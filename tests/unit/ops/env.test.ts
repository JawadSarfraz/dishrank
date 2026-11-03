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
    const result = parseEnv({
      ...valid,
      CRON_SECRET: "",
      IP_HASH_SECRET: "",
      BETTER_AUTH_SECRET: "short",
      DATABASE_URL: "mysql://x",
    });
    expect(result.success).toBe(false);
    const text = describeEnvProblems(result.error!);
    expect(text).toContain("CRON_SECRET");
    expect(text).toContain("IP_HASH_SECRET");
    expect(text).toContain("BETTER_AUTH_SECRET");
    expect(text).toContain("DATABASE_URL");
    expect(text).not.toContain("short"); // values are never echoed
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
    const withMode = parseEnv({ ...valid, DATABASE_URL: `${pooled}&sslmode=require` });
    expect(withMode.success).toBe(false);
    expect(describeEnvProblems(withMode.error!)).toContain("DATABASE_URL");
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
