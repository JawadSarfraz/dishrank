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
    // Google's name, address and credits may appear only where the result card displays them:
    // any other use (a Create payload, a prefill, a prop) adds a line and fails here.
    const googleLines = read("src/components/admin/ImportClient.tsx")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /displayName|formattedAddress|attributions/.test(line));
    expect(googleLines).toEqual([
      '<p className="font-medium">{result.displayName || "(no name)"}</p>',
      '<p className="text-sm text-muted-foreground">{result.formattedAddress || "(no address)"}</p>',
      "{result.attributions.length > 0 && (",
      "{result.attributions.map((a, i) => (",
    ]);
  });

  it("keeps no module-level store that could hold Google results between requests", () => {
    const googleModules = files.filter(
      (f) =>
        f.startsWith(path.join("src", "server", "places")) ||
        /(import\.service|places-seed|places-query|places-refresh\.service)\.ts$/.test(f),
    );
    expect(googleModules.length).toBeGreaterThan(5);
    const offenders = googleModules.filter((f) =>
      read(f)
        .split("\n")
        .some((line) =>
          /^(export )?let |^(export )?const \w+ = new (Map|Set|WeakMap)[<(]/.test(line),
        ),
    );
    expect(offenders).toEqual([]);
  });

  it("turns off the dev-only Next.js caches and logs that would keep Google responses", () => {
    const config = read("next.config.ts");
    expect(config).toMatch(/serverComponentsHmrCache:\s*false/); // HMR fetch cache ignores no-store
    expect(config).toMatch(/serverFunctions:\s*false/); // would print action args (page tokens)
  });
});
