// Source checks for the Google data rules (CLAUDE.md rule 2): no response cache anywhere, no file
// output from the planning tool, no prefill or logging of Google names and addresses.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const files = [...sourceFiles("src"), ...sourceFiles("scripts")];

describe("Google data rules in the source", () => {
  it("caches no response: no unstable_cache, 'use cache' or force-cache anywhere", () => {
    const offenders = files.filter((f) =>
      /unstable_cache|["']use cache["']|force-cache/.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });

  it("sends every Google request with cache: no-store", () => {
    for (const f of ["src/server/places/textSearch.ts", "src/server/places/placeDetails.ts"]) {
      expect(read(f)).toContain('cache: "no-store"');
    }
  });

  it("the planning tool writes no file", () => {
    for (const f of ["scripts/seed-places.ts", "src/server/services/places-seed.ts"]) {
      expect(read(f)).not.toMatch(/from "(node:)?fs(\/promises)?"/);
    }
  });

  it("no log line and no Create form touches a Google name or address", () => {
    const offenders = files.filter((f) =>
      read(f)
        .split("\n")
        .some(
          (line) => /logEvent|console\./.test(line) && /displayName|formattedAddress/.test(line),
        ),
    );
    expect(offenders).toEqual([]);
    expect(read("src/components/admin/RestaurantCreateFields.tsx")).not.toMatch(
      /displayName|formattedAddress/,
    );
    expect(read("src/components/admin/ImportClient.tsx")).not.toMatch(
      /defaultValue=\{[^}]*(displayName|formattedAddress)/,
    );
  });
});
