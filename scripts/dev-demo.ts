// pnpm dev:demo [-- --undo] [-- --verbose]
// Local demo data for trying Phase 3 (src/server/services/dev-demo.service.ts): restaurants from
// the most confident Overture candidates in F-7, F-6, Blue Area and G-9, demo users (one on the
// panel), ratings and review items. --undo removes all of it. Refuses production and any database
// that is not on this machine.
import "dotenv/config";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import {
  DEMO,
  assertLocalDatabase,
  createDemo,
  undoDemo,
} from "@/server/services/dev-demo.service";

const USAGE = "usage: pnpm dev:demo [-- --undo] [-- --verbose]";
const KNOWN_FLAGS = ["--undo", "--verbose"];

async function main(argv: readonly string[]): Promise<number> {
  const unknown = argv.filter((a) => a !== "--" && !KNOWN_FLAGS.includes(a));
  if (unknown.length > 0) {
    console.error(`unknown argument: ${unknown.join(" ")}\n${USAGE}`);
    return 1;
  }
  const target = assertLocalDatabase(process.env);
  console.log(`database "${target.database}" on ${target.host}`);
  // The services log one JSON line per event; hundreds of them would bury the summary.
  if (!argv.includes("--verbose")) console.info = () => {};

  if (argv.includes("--undo")) {
    const r = await undoDemo();
    console.log(
      `removed ${r.restaurants} restaurants, ${r.users} demo users, ${r.ratings} ratings, ` +
        `${r.reviewItems} review items, ${r.rateLimitBuckets} rate-limit buckets and ` +
        `${r.jobRuns} demo job records; ${r.candidatesReopened} Overture candidates are NEW again.`,
    );
    if (r.otherRaters > 0) {
      console.log(
        `${r.otherRaters} other users had rated demo dishes: their counters and trust were recounted.`,
      );
    }
    if (r.removedDishes.length > 0) {
      console.log(
        `removed dishes created from demo proposals: ${r.removedDishes.join(", ")} (restart pnpm dev so dish matching forgets them).`,
      );
    }
    if (r.keptDishes.length > 0) {
      console.log(
        `kept dishes created from demo proposals that are in use now: ${r.keptDishes.join(", ")}`,
      );
    }
    return 0;
  }

  const s = await createDemo();
  console.log(
    `created ${s.restaurants.length} restaurants (names end in "${DEMO.nameMark.trim()}"), ` +
      `${s.users} demo users (@${DEMO.emailDomain}, one on the panel) and ${s.ratings.saved} ratings ` +
      `(${s.ratings.held} held for review${s.ratings.skipped ? `, ${s.ratings.skipped} skipped by the rate limit` : ""}).`,
  );
  console.log(
    `${s.dishRows} dish rows: ${s.rankedRows} ranked, ${s.needsMoreRows} need more ratings. ` +
      `Review items: ${s.reviewItems.join(", ")}.`,
  );
  for (const list of s.lists) {
    const top = list.rows
      .slice(0, 3)
      .map((r) => `${r.rank}. ${r.name} ${r.score.toFixed(1)} (${r.votes} votes)`)
      .join("; ");
    console.log(`  ${list.dish} in Islamabad: ${top}`);
  }
  const first = s.restaurants[0];
  console.log(
    [
      "",
      "Try it with pnpm dev, signed in with your Google account:",
      "  http://localhost:3000/rate            rate a dish (search for a restaurant above)",
      `  http://localhost:3000/${DEMO.citySlug}/r/${first.slug}`,
      "  http://localhost:3000/me              your ratings",
      "  http://localhost:3000/admin/review    held ratings, burst, proposals, location suggestion",
      "  http://localhost:3000/admin/users     turn the panel on for yourself",
      "Remove it all with: pnpm dev:demo -- --undo",
    ].join("\n"),
  );
  return 0;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof AppError ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
