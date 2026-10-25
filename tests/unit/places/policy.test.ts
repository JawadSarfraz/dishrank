import { describe, expect, it } from "vitest";
import { checkFetchedAt } from "@/server/services/places-policy";

const NOW = new Date("2026-10-25T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("checkFetchedAt (Create and Link save only fresh Google data)", () => {
  it("accepts a search result up to 24 hours old and reports its age", () => {
    expect(checkFetchedAt(hoursAgo(0.05), NOW)).toMatchObject({ ok: true });
    expect(checkFetchedAt(hoursAgo(23.9), NOW).ok).toBe(true);
  });

  it("rejects a missing, unparseable, future or older-than-24-hours fetch time", () => {
    expect(checkFetchedAt("", NOW)).toEqual({ ok: false, reason: "fetchedAt is missing" });
    expect(checkFetchedAt("yesterday", NOW)).toEqual({
      ok: false,
      reason: "fetchedAt is not an ISO date-time",
    });
    expect(checkFetchedAt(hoursAgo(-24), NOW)).toEqual({
      ok: false,
      reason: "fetchedAt is in the future",
    });
    const stale = checkFetchedAt(hoursAgo(25), NOW);
    expect(!stale.ok && stale.reason).toMatch(
      /^Fetched 25 hours ago: Google data older than 24 hours cannot be saved/,
    );
    const old = checkFetchedAt(hoursAgo(31 * 24), NOW);
    expect(!old.ok && old.reason).toMatch(/^Fetched 31 days ago: /);
  });

  it("allows 10 minutes of clock skew", () => {
    expect(checkFetchedAt(new Date(NOW.getTime() + 5 * 60_000).toISOString(), NOW).ok).toBe(true);
    expect(checkFetchedAt(new Date(NOW.getTime() + 15 * 60_000).toISOString(), NOW).ok).toBe(false);
  });
});
