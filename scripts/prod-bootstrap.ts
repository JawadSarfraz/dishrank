// pnpm prod:bootstrap: prepares a new production database (docs/DEPLOY-CHECKLIST.md): migrations
// (prisma migrate deploy), the taxonomy seed (cities, areas, dishes) and the Overture candidates of
// both cities for /admin/import. It reads DATABASE_URL and DIRECT_URL from your shell only, never
// from .env, shows where they point and changes nothing until you type that host. It never creates
// demo or fake data. Every step is safe to run again.
import { spawnSync } from "node:child_process";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import {
  assertSameDatabase,
  confirms,
  describeTarget,
  valuesToConfirm,
} from "@/server/services/prod-bootstrap-guard";

const STEPS = [
  {
    title: "migrations: prisma migrate deploy (through DIRECT_URL)",
    args: ["exec", "prisma", "migrate", "deploy"],
  },
  {
    title: "taxonomy seed: cities, areas, dishes and their spellings (prisma db seed)",
    args: ["exec", "prisma", "db", "seed"],
  },
  {
    title: "Overture candidates for Islamabad and Rawalpindi (overture:sync --city=all)",
    args: ["exec", "tsx", "scripts/overture-sync.ts", "--city=all"],
  },
] as const;

async function main(argv: readonly string[]): Promise<number> {
  if (argv.some((a) => a !== "--")) {
    console.error(
      "usage: pnpm prod:bootstrap (no arguments; set DATABASE_URL and DIRECT_URL first)",
    );
    return 1;
  }
  const targets = [
    describeTarget("DATABASE_URL", process.env.DATABASE_URL),
    describeTarget("DIRECT_URL", process.env.DIRECT_URL),
  ];
  assertSameDatabase(targets);
  console.log("pnpm prod:bootstrap will change this database:");
  for (const t of targets) {
    const project = t.projectRef ? `, Supabase project ${t.projectRef}` : "";
    console.log(
      `  ${t.name.padEnd(13)}${t.host}:${t.port}/${t.database} (user ${t.user}${project})`,
    );
  }
  console.log("Steps:");
  for (const [i, step] of STEPS.entries()) console.log(`  ${i + 1}. ${step.title}`);

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    for (const { label, value } of valuesToConfirm(targets)) {
      const answer = await rl.question(`\nType the ${label} shown above to continue: `);
      if (!confirms(answer, value)) {
        console.error(`That is not the ${label}. Nothing was changed.`);
        return 1;
      }
    }
  } finally {
    rl.close();
  }

  // The children (Prisma CLI, seed, sync) load dotenv: point it at an empty file, so nothing from a
  // local .env ever mixes in. NODE_ENV stays unset: these scripts are not the production server.
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      DOTENV_PATH: "/dev/null",
      DOTENV_CONFIG_PATH: "/dev/null",
      DOTENV_QUIET: "true",
      DOTENV_CONFIG_QUIET: "true",
    }).filter(([key]) => key !== "NODE_ENV"),
  ) as NodeJS.ProcessEnv; // Next.js types NODE_ENV as always present; here it is left out on purpose
  console.log(
    "\nThe seed and the sync may print an [env] warning about app settings they do not use " +
      "(auth, cron): that is expected.",
  );
  for (const [i, step] of STEPS.entries()) {
    console.log(`\n[${i + 1}/${STEPS.length}] ${step.title}`);
    const run = spawnSync("pnpm", step.args, { stdio: "inherit", env });
    if (run.status !== 0) {
      console.error(
        `\nStep ${i + 1} failed (${run.error?.message ?? `exit ${run.status ?? run.signal}`}). ` +
          "Fix the cause and run pnpm prod:bootstrap again: every step is safe to repeat.",
      );
      return 1;
    }
  }
  console.log(
    "\nDone. The database is ready. Next: docs/DEPLOY-CHECKLIST.md step 5 (the Vercel project); " +
      "a later re-run needs nothing else.",
  );
  return 0;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
