// The uptime monitor's check on a production build (docs/06 GET /api/health): ok, and never cached.
import { expect, test } from "@playwright/test";

test("GET /api/health answers {ok:true} and is never cached", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(res.headers()["cache-control"]).toContain("no-store");
});
