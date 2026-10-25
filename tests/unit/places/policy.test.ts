import { describe, expect, it } from "vitest";
import { checkFetchedAt } from "@/server/services/places-policy";

const NOW = new Date("2026-10-25T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("checkFetchedAt (Google data is kept at most 30 days)", () => {
  it("accepts a fresh fetch time and reports its age", () => {
    expect(checkFetchedAt(daysAgo(2), NOW)).toMatchObject({ ok: true, ageDays: 2 });
    expect(checkFetchedAt(daysAgo(29.9), NOW).ok).toBe(true);
  });

  it("rejects a missing, unparseable, future or older-than-30-days fetch time", () => {
    expect(checkFetchedAt("", NOW)).toEqual({ ok: false, reason: "fetchedAt is missing" });
    expect(checkFetchedAt("yesterday", NOW)).toEqual({
      ok: false,
      reason: "fetchedAt is not an ISO date-time",
    });
    expect(checkFetchedAt(daysAgo(-1), NOW)).toEqual({
      ok: false,
      reason: "fetchedAt is in the future",
    });
    const old = checkFetchedAt(daysAgo(31), NOW);
    expect(old.ok).toBe(false);
    expect(!old.ok && old.reason).toMatch(
      /^Fetched 31 days ago: .*older than 30 days cannot be saved/,
    );
  });

  it("allows 10 minutes of clock skew", () => {
    expect(checkFetchedAt(new Date(NOW.getTime() + 5 * 60_000).toISOString(), NOW).ok).toBe(true);
    expect(checkFetchedAt(new Date(NOW.getTime() + 15 * 60_000).toISOString(), NOW).ok).toBe(false);
  });
});
