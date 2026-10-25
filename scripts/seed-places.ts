// pnpm seed:places -- --city=islamabad --dish=chicken-karahi [--areas=f-7,f-8] [--dry-run] [--max-calls=150]
// Planning tool (docs/07 §1): per-area counts and call estimates for the live search on
// /admin/import. Place ids only; no file written; reads the city, areas and dish, never writes the DB.
import "dotenv/config";
import { env } from "@/env";
import { db } from "@/server/db";
import { createPlacesClient } from "@/server/places";
import { runSeedPlaces } from "@/server/services/places-seed";

runSeedPlaces(process.argv.slice(2), {
  print: (line) => console.log(line),
  printError: (line) => console.error(line),
  createClient: (maxCalls) =>
    env.GOOGLE_PLACES_API_KEY
      ? createPlacesClient({ apiKey: env.GOOGLE_PLACES_API_KEY, maxCalls })
      : null,
})
  .then(async (code) => {
    await db.$disconnect();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    await db.$disconnect();
    console.error("seed:places failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
