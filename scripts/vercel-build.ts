// The Vercel build (vercel.json buildCommand, docs/10): `prisma generate`, then `prisma migrate
// deploy` through DIRECT_URL on production deployments only, then `next build`. Preview deployments
// never migrate a database. The Prisma client (src/generated, git-ignored) is generated here on every
// build: the install's postinstall hook is not guaranteed to run on Vercel (cached or not), and
// without the client `next build` fails with "Module not found: @/generated/prisma/...".
// Migrations must stay backwards compatible (add, then use, then remove): they run before the new
// code is live, and a failed build leaves the previous deployment serving. The local binaries are
// called directly, so no nested pnpm call depends on which pnpm the build image has.
import { spawnSync } from "node:child_process";
import { join } from "node:path";

function run(bin: string, args: readonly string[]) {
  const result = spawnSync(join("node_modules", ".bin", bin), args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`vercel-build: ${bin} ${args.join(" ")} failed`);
    process.exit(result.status ?? 1);
  }
}

run("prisma", ["generate"]);
if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DIRECT_URL) {
    console.error("vercel-build: DIRECT_URL is not set for Production, so migrations cannot run.");
    process.exit(1);
  }
  run("prisma", ["migrate", "deploy"]);
} else {
  console.log(
    `vercel-build: VERCEL_ENV=${process.env.VERCEL_ENV ?? "(unset)"}, no migrations (production only).`,
  );
}
run("next", ["build"]);
