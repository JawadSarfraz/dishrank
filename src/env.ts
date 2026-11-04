import { describeEnvProblems, parseEnv, validVariables, type Env } from "./env-schema";

export { describeEnvProblems, parseEnv, validVariables, type Env } from "./env-schema";

/**
 * Server environment, validated with Zod (src/env-schema.ts; docs/10 lists every variable).
 * - Production server: a missing or malformed required variable throws at startup
 *   (src/instrumentation.ts imports this module in register()). The Vercel build checks the same
 *   schema first (scripts/vercel-build.ts), so such a deployment never goes live.
 * - `next build`, development and tests: problems are logged and the app keeps going,
 *   so missing values are undefined at runtime even where the type says string.
 * Server code reads `env`, never `process.env`. Values are never logged.
 */
function loadEnv(): Env {
  const result = parseEnv(process.env);
  if (result.success) return result.data;

  const message = `Invalid or missing environment variables:\n${describeEnvProblems(result.error, process.env)}`;
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuild) {
    throw new Error(message);
  }
  console.warn(`[env] ${message}`);
  return validVariables(process.env) as Env;
}

export const env: Env = loadEnv();
