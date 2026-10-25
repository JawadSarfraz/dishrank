import { describe, expect, it } from "vitest";
import { CsvError, encodeCsv, parseCsv } from "@/lib/csv";
import {
  CANDIDATE_COLUMNS,
  encodeCandidatesCsv,
  parseCandidatesCsv,
  type CandidateRow,
} from "@/server/services/candidates-csv";
import { checkFetchedAt } from "@/server/services/places-policy";

const NOW = new Date("2026-10-25T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const row = (over: Partial<CandidateRow> = {}): CandidateRow => ({
  googlePlaceId: "ChIJbutt-karahi-0001",
  displayName: 'Butt Karahi, "Original"',
  formattedAddress: "Shop 3, F-7 Markaz\nIslamabad",
  lat: 33.7212345,
  lng: 73.0571234,
  primaryType: "restaurant",
  queryArea: "f-7",
  dishSlug: "chicken-karahi",
  fetchedAt: daysAgo(2),
  ...over,
});

describe("csv", () => {
  it("round-trips commas, quotes and line breaks", () => {
    const rows = [["a,b", 'say "hi"', "two\nlines", ""]];
    expect(parseCsv(encodeCsv(["w", "x", "y", "z"], rows))).toEqual([
      ["w", "x", "y", "z"],
      ...rows,
    ]);
  });

  it("accepts CRLF, a BOM and blank lines", () => {
    expect(parseCsv('\uFEFFa,b\r\n\r\n1,"2"\r\n')).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a\n"open')).toThrow(CsvError);
  });
});

describe("candidates CSV (docs/07 §1-2)", () => {
  it("writes the documented columns and reads valid rows back unchanged", () => {
    const text = encodeCandidatesCsv([row()]);
    expect(text.split("\n")[0]).toBe(CANDIDATE_COLUMNS.join(","));
    const [parsed] = parseCandidatesCsv(text, NOW);
    expect(parsed).toMatchObject({ ok: true, line: 2, row: row() });
  });

  it("rejects rows whose fetchedAt is missing, unparseable, in the future or older than 30 days", () => {
    const text = encodeCandidatesCsv([
      row({ fetchedAt: "" }),
      row({ fetchedAt: "yesterday" }),
      row({ fetchedAt: daysAgo(-1) }),
      row({ fetchedAt: daysAgo(31) }),
      row({ fetchedAt: daysAgo(29.9) }),
    ]);
    const results = parseCandidatesCsv(text, NOW);
    expect(results.map((r) => r.ok)).toEqual([false, false, false, false, true]);
    const reasons = results.flatMap((r) => (r.ok ? [] : r.reasons));
    expect(reasons).toEqual([
      "fetchedAt is missing",
      "fetchedAt is not an ISO date-time",
      "fetchedAt is in the future",
      expect.stringMatching(/^Fetched 31 days ago: .*older than 30 days cannot be imported/),
    ]);
  });

  it("reports bad coordinates, ids and slugs per row", () => {
    const text = encodeCsv(CANDIDATE_COLUMNS, [
      ["x", "Name", "", "", "200", "", "F 7", "chicken-karahi", daysAgo(1)],
    ]);
    const [result] = parseCandidatesCsv(text, NOW);
    expect(result?.ok).toBe(false);
    expect(result && !result.ok && result.reasons.join(" | ")).toMatch(
      /googlePlaceId: .*\| lat: missing \| lng: .*\| queryArea: /,
    );
  });

  it("refuses a file without the documented columns", () => {
    expect(() => parseCandidatesCsv("googlePlaceId,displayName\nabc,def\n", NOW)).toThrow(
      /Missing columns: formattedAddress, lat, lng/,
    );
  });
});

describe("checkFetchedAt", () => {
  it("allows 10 minutes of clock skew", () => {
    expect(checkFetchedAt(new Date(NOW.getTime() + 5 * 60_000).toISOString(), NOW).ok).toBe(true);
    expect(checkFetchedAt(new Date(NOW.getTime() + 15 * 60_000).toISOString(), NOW).ok).toBe(false);
  });
});
