import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { RATE_LIMITS, assertRateLimit, bucketSeconds } from "@/server/rate-limit";
import { clientIp, ipHash } from "@/server/request-ip";
import { resetAppData } from "../../setup/db-reset";

describe("rate limits (docs/06, test DB)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("sizes buckets from the window", () => {
    expect(bucketSeconds(60)).toBe(5);
    expect(bucketSeconds(3600)).toBe(300);
    expect(bucketSeconds(86_400)).toBe(7200);
  });

  it("allows 120 searches a minute, refuses the 121st, and forgets them after the window", async () => {
    const key = "ip:test:search";
    const t0 = new Date("2026-10-25T10:00:02Z");
    for (let i = 0; i < 120; i++) {
      await assertRateLimit(key, RATE_LIMITS.search, new Date(t0.getTime() + i * 400)); // spread over 48 s
    }
    await expect(
      assertRateLimit(key, RATE_LIMITS.search, new Date(t0.getTime() + 50_000)),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
    await expect(
      assertRateLimit(key, RATE_LIMITS.search, new Date(t0.getTime() + 115_000)),
    ).resolves.toBeUndefined();
    await expect(
      assertRateLimit("ip:other:search", RATE_LIMITS.search, t0),
    ).resolves.toBeUndefined();
  });

  it("hashes the client IP with a key; the raw IP is never the key", () => {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" });
    expect(clientIp(headers)).toBe("10.0.0.1");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers())).toBe("unknown");
    const hash = ipHash("203.0.113.9");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).not.toContain("203");
    expect(ipHash("203.0.113.9")).toBe(hash);
  });
});
