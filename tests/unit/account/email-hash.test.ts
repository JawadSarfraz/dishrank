// The ban list's hash is keyed: a copy of BannedEmail cannot be checked against a list of addresses
// without the server's secret (owner, 2026-11-06).
import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

async function hashWith(env: { IP_HASH_SECRET?: string; NODE_ENV?: string }) {
  vi.resetModules();
  vi.doMock("@/env", () => ({ env }));
  return (await import("@/server/email-hash")).emailHash;
}

const ADDRESS = "banned.person@example.com";

describe("emailHash", () => {
  afterEach(() => vi.doUnmock("@/env"));

  it("is not a plain hash of the address", async () => {
    const hash = (await hashWith({ IP_HASH_SECRET: "a".repeat(64) }))(ADDRESS);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(createHash("sha256").update(ADDRESS).digest("hex"));
  });

  it("depends on the secret, and is stable under one secret", async () => {
    const one = await hashWith({ IP_HASH_SECRET: "a".repeat(64) });
    const first = one(ADDRESS);
    expect(one(ADDRESS)).toBe(first);
    const other = await hashWith({ IP_HASH_SECRET: "b".repeat(64) });
    expect(other(ADDRESS)).not.toBe(first);
  });

  it("has its own label: the secret alone, or the IP hash's key, does not reproduce it", async () => {
    const secret = "a".repeat(64);
    const hash = (await hashWith({ IP_HASH_SECRET: secret }))(ADDRESS);
    expect(hash).not.toBe(createHmac("sha256", secret).update(ADDRESS).digest("hex"));
    const ipKey = createHmac("sha256", secret).update("dishrank/ip-hash/v2").digest();
    expect(hash).not.toBe(createHmac("sha256", ipKey).update(ADDRESS).digest("hex"));
  });

  it("ignores case and surrounding spaces, as Google's address may arrive either way", async () => {
    const hash = await hashWith({ IP_HASH_SECRET: "a".repeat(64) });
    expect(hash("  Banned.Person@Example.COM ")).toBe(hash(ADDRESS));
  });

  it("refuses to run in production without the secret", async () => {
    const hash = await hashWith({ NODE_ENV: "production" });
    expect(() => hash(ADDRESS)).toThrow("IP_HASH_SECRET");
  });
});
