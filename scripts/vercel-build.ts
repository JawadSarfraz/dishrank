// The Vercel build (vercel.json buildCommand, docs/10): first the environment check, then `prisma
// generate`, then `prisma migrate deploy` through DIRECT_URL on production deployments only, then
// `next build`. Preview deployments never migrate a database.
// The environment check comes before anything else (2026-11-04: a deployment without the new
// IP_HASH_SECRET went live and every request failed for two hours): the variables a production
// server needs are checked with the server's own schema (src/env-schema.ts), and a missing or
// invalid one stops the build, naming only the variables, never values. A failed build never goes
// live, so the last good deployment keeps serving.
// The Prisma client (src/generated, git-ignored) is generated here on every build: the install's
// postinstall hook is not guaranteed to run on Vercel (cached or not), and without the client
// `next build` fails with "Module not found: @/generated/prisma/...".
// Migrations must stay backwards compatible (add, then use, then remove): they run before the new
// code is live, and a failed build leaves the previous deployment serving. The local binaries are
// called directly, so no nested pnpm call depends on which pnpm the build image has.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describeEnvProblems, parseEnv } from "@/env-schema";

function run(bin: string, args: readonly string[]) {
  const result = spawnSync(join("node_modules", ".bin", bin), args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`vercel-build: ${bin} ${args.join(" ")} failed`);
    process.exit(result.status ?? 1);
  }
}

const checked = parseEnv(process.env);
if (!checked.success) {
  console.error(
    [
      "vercel-build: stopped before migrations: these environment variables are missing or invalid",
      "(names only, never values):",
      describeEnvProblems(checked.error, process.env),
      "Add or fix them in Vercel → Settings → Environment Variables (Production), then redeploy.",
      "This build does not go live; the last good deployment keeps serving.",
    ].join("\n"),
  );
  process.exit(1);
}

run("prisma", ["generate"]);
if (process.env.VERCEL_ENV === "production") {
  // DIRECT_URL is one of the variables checked above.
  run("prisma", ["migrate", "deploy"]);
} else {
  console.log(
    `vercel-build: VERCEL_ENV=${process.env.VERCEL_ENV ?? "(unset)"}, no migrations (production only).`,
  );
}
run("next", ["build"]);
