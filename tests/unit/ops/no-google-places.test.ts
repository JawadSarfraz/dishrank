// CLAUDE.md rules 1-2 and docs/02 ADR-13: DishRank never uses Google Places. Google appears only as
// the sign-in provider (OAuth) and the Geist font; no Places client, key, endpoint or cron returns.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function files(dir: string): string[] {
  if (!fs.existsSync(path.join(ROOT, dir))) return [];
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : files(rel);
    return /\.(ts|tsx|json|mjs|mts)$/.test(entry.name) ? [rel] : [];
  });
}

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("no Google Places anywhere", () => {
  it("has no Places client, endpoint, key or import in the app, scripts, config or env", () => {
    const sources = [
      ...files("src"),
      ...files("scripts"),
      ...files("prisma"),
      "package.json",
      "vercel.json",
      "next.config.ts",
      ".env.example",
    ];
    const pattern =
      /places\.googleapis\.com|GOOGLE_PLACES|@\/server\/places|maps\.googleapis\.com|googlePlaceId|refresh-places|seed:places/;
    expect(sources.filter((f) => pattern.test(read(f)))).toEqual([]);
    expect(fs.existsSync(path.join(ROOT, "src/server/places"))).toBe(false);
  });

  it("schedules no Places refresh", () => {
    const crons = (JSON.parse(read("vercel.json")) as { crons: { path: string }[] }).crons;
    expect(crons.map((c) => c.path)).toEqual(["/api/cron/recompute-rankings"]);
  });
});
