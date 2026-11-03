import { describe, expect, it } from "vitest";
import { requireCronSecret } from "@/server/cron";

const SECRET = "x".repeat(64);
const req = (authorization?: string) =>
  new Request("http://localhost/api/cron/recompute-rankings", {
    headers: authorization === undefined ? {} : { authorization },
  });

describe("requireCronSecret", () => {
  it("fails closed with 500 when CRON_SECRET is unset or empty", async () => {
    for (const secret of [undefined, ""]) {
      const res = requireCronSecret(req(`Bearer ${SECRET}`), secret);
      expect(res?.status).toBe(500);
      expect(await res?.json()).toMatchObject({ error: { code: "CRON_SECRET_MISSING" } });
    }
  });

  it("answers 401 for a missing, empty, wrong or wrong-length token", () => {
    for (const header of [
      undefined,
      "",
      "Bearer ",
      `Bearer ${"y".repeat(64)}`,
      `Bearer ${SECRET}x`,
      SECRET,
    ]) {
      expect(requireCronSecret(req(header), SECRET)?.status).toBe(401);
    }
  });

  it("lets the right token through", () => {
    expect(requireCronSecret(req(`Bearer ${SECRET}`), SECRET)).toBeNull();
  });
});

describe("scheduled cron routes", () => {
  it("every route in vercel.json refuses a request without the right bearer token", async () => {
    const fs = await import("node:fs");
    const crons = (
      JSON.parse(fs.readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] }
    ).crons;
    for (const { path } of crons) {
      const route = (await import(`@/app${path}/route`)) as {
        GET: (r: Request) => Promise<Response>;
      };
      for (const authorization of [undefined, "Bearer wrong"]) {
        const res = await route.GET(
          new Request(`http://localhost${path}`, {
            headers: authorization ? { authorization } : {},
          }),
        );
        // 401, or 500 CRON_SECRET_MISSING when the test environment has no secret: never run.
        expect([401, 500], path).toContain(res.status);
        expect(((await res.json()) as { error: { code: string } }).error.code).toMatch(
          /^(UNAUTHORIZED|CRON_SECRET_MISSING)$/,
        );
      }
    }
  });
});
