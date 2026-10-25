import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { resetAppData } from "../../setup/db-reset";

// The real route module with stubbed env: fail-closed cron auth, then a run that needs no Google
// call (no restaurants, no API key). fetch throws, so a network call would fail the test.
const SECRET = "c".repeat(64);
const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/refresh-places", {
    headers: authorization === undefined ? {} : { authorization },
  });

async function loadRoute(vars: Record<string, string>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  return import("@/app/api/cron/refresh-places/route");
}

describe("GET /api/cron/refresh-places", () => {
  beforeEach(async () => {
    await resetAppData();
    vi.stubGlobal("fetch", async () => {
      throw new Error("network is not allowed in tests");
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  afterAll(() => db.$disconnect());

  it("refuses every request with 500 when CRON_SECRET is not set, and does nothing", async () => {
    const { GET } = await loadRoute({ CRON_SECRET: "" });
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: "CRON_SECRET_MISSING" } });
    expect(await db.jobRun.count()).toBe(0);
  });

  it("answers 401 to a missing or wrong token", async () => {
    const { GET } = await loadRoute({ CRON_SECRET: SECRET });
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request(`Bearer ${"x".repeat(64)}`))).status).toBe(401);
    expect(await db.jobRun.count()).toBe(0);
  });

  it("runs with the right token and records a JobRun", async () => {
    const { GET } = await loadRoute({ CRON_SECRET: SECRET, GOOGLE_PLACES_API_KEY: "" });
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, summary: { selected: 0, calls: 0 } });
    expect(await db.jobRun.findMany()).toMatchObject([{ name: "refresh-places", ok: true }]);
  });
});
