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
