// GET /api/health (uptime monitor): ok only when the database answers in time; no details in the
// answer, the reason in the log; never cached; its own per-IP limit.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { db } from "@/server/db";
import { RATE_LIMITS } from "@/server/rate-limit";
import { checkHealth } from "@/server/services/health.service";
import { resetAppData } from "../../setup/db-reset";

const get = (ip = "203.0.113.5") =>
  new Request("http://localhost/api/health", { headers: { "x-forwarded-for": ip } });

describe("GET /api/health (test DB)", () => {
  beforeEach(resetAppData);
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => db.$disconnect());

  it("answers 200 {ok:true}, never cached, when the database answers", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 {ok:false} when the query fails or takes longer than allowed, and logs why", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = () => Promise.reject(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    expect(await checkHealth("ip-a", { ping: failing })).toEqual({ ok: false, status: 503 });
    const started = Date.now();
    const hanging = () => new Promise(() => {});
    expect(await checkHealth("ip-b", { timeoutMs: 200, ping: hanging })).toEqual({
      ok: false,
      status: 503,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    const lines = log.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(lines).toMatchObject([
      { action: "health.fail", reason: "database", error: "connect ECONNREFUSED 10.0.0.1:5432" },
      { action: "health.fail", reason: "timeout" },
    ]);
  });

  it("allows a check every 5 s per IP and answers 429 {ok:false} beyond that", async () => {
    const t0 = new Date("2026-11-04T10:00:00Z");
    // A monitor checking once a minute uses 1 of the 12.
    for (let i = 0; i < RATE_LIMITS.health.limit; i++) {
      const at = new Date(t0.getTime() + i * 1000);
      expect(await checkHealth("ip-c", { now: at })).toEqual({ ok: true, status: 200 });
    }
    const late = new Date(t0.getTime() + 20_000);
    expect(await checkHealth("ip-c", { now: late })).toEqual({ ok: false, status: 429 });
    expect(await checkHealth("ip-d", { now: late })).toEqual({ ok: true, status: 200 });
  });
});
