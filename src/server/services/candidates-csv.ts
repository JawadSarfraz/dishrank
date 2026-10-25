// The scratch CSV written by `pnpm seed:places` and read back by /admin/import (docs/07 §1-2).
import { z } from "zod";
import { CsvError, encodeCsv, parseCsv } from "@/lib/csv";
import { googlePlaceId, slug } from "@/server/validation/common";
import { checkFetchedAt } from "./places-policy";

export const CANDIDATE_COLUMNS = [
  "googlePlaceId",
  "displayName",
  "formattedAddress",
  "lat",
  "lng",
  "primaryType",
  "queryArea",
  "dishSlug",
  "fetchedAt",
] as const;

export type CandidateColumn = (typeof CANDIDATE_COLUMNS)[number];

export type CandidateRow = {
  googlePlaceId: string;
  displayName: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  primaryType: string;
  /** Slug of the area the search was centred on (not necessarily where the place is). */
  queryArea: string;
  dishSlug: string;
  /** UTC ISO time of the Google response that returned the row. */
  fetchedAt: string;
};

/** 30 areas × 60 results is the most one seed run can produce. */
export const MAX_CANDIDATE_ROWS = 2000;

export function encodeCandidatesCsv(rows: readonly CandidateRow[]): string {
  return encodeCsv(
    CANDIDATE_COLUMNS,
    rows.map((row) => CANDIDATE_COLUMNS.map((column) => String(row[column]))),
  );
}

const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, "missing")
    .transform(Number)
    .pipe(z.number().min(min).max(max));

const rowSchema = z.object({
  googlePlaceId,
  displayName: z.string().trim().max(300),
  formattedAddress: z.string().trim().max(500),
  lat: coordinate(-90, 90),
  lng: coordinate(-180, 180),
  primaryType: z.string().trim().max(100),
  queryArea: slug,
  dishSlug: slug,
});

export type ParsedCandidate =
  | { line: number; ok: true; row: CandidateRow; fetchedAt: Date; ageDays: number }
  | { line: number; ok: false; reasons: string[]; raw: Partial<Record<CandidateColumn, string>> };

/**
 * Reads the candidates CSV. Throws CsvError when the file itself is unusable (bad quoting, missing
 * columns, too many rows); otherwise returns every row, each valid or with its reasons.
 */
export function parseCandidatesCsv(text: string, now: Date): ParsedCandidate[] {
  const [header, ...lines] = parseCsv(text);
  if (!header) throw new CsvError("The file is empty.");
  const index = new Map(header.map((name, i) => [name.trim(), i]));
  const missing = CANDIDATE_COLUMNS.filter((c) => !index.has(c));
  if (missing.length > 0) throw new CsvError(`Missing columns: ${missing.join(", ")}.`);
  if (lines.length > MAX_CANDIDATE_ROWS) {
    throw new CsvError(`Too many rows (${lines.length}); the limit is ${MAX_CANDIDATE_ROWS}.`);
  }

  return lines.map((cells, i): ParsedCandidate => {
    const line = i + 2; // 1-based, after the header
    const raw = Object.fromEntries(
      CANDIDATE_COLUMNS.map((c) => [c, cells[index.get(c)!] ?? ""]),
    ) as Record<CandidateColumn, string>;
    const reasons: string[] = [];
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) reasons.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    const age = checkFetchedAt(raw.fetchedAt, now);
    if (!age.ok) reasons.push(age.reason);
    if (!parsed.success || !age.ok) return { line, ok: false, reasons, raw };
    return {
      line,
      ok: true,
      row: { ...parsed.data, fetchedAt: age.fetchedAt.toISOString() },
      fetchedAt: age.fetchedAt,
      ageDays: age.ageDays,
    };
  });
}
