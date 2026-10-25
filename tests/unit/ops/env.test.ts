import { describe, expect, it } from "vitest";
import { describeEnvProblems, parseEnv, validVariables } from "@/env";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u@localhost:5432/db",
  DIRECT_URL: "postgresql://u@localhost:5432/db",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  CRON_SECRET: "c".repeat(64),
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
      BETTER_AUTH_SECRET: "short",
      DATABASE_URL: "mysql://x",
    });
    expect(result.success).toBe(false);
    const text = describeEnvProblems(result.error!);
    expect(text).toContain("CRON_SECRET");
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
});
