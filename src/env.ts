import { z } from "zod";

/**
 * Server environment, validated with Zod (docs/10 lists every variable).
 * - Production server: a missing or malformed required variable throws at startup
 *   (src/instrumentation.ts imports this module in register()).
 * - `next build`, development and tests: problems are logged and the app keeps going,
 *   so missing values are undefined at runtime even where the type says string.
 * Server code reads `env`, never `process.env`. Values are never logged.
 */
const postgresUrl = z.string().regex(/^postgres(ql)?:\/\//, "must be a postgresql:// URL");
const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl,

  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ADMIN_EMAIL: z.email().optional(),

  CRON_SECRET: z.string().min(32, "must be at least 32 characters"),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),

  // Needed from later phases; optional until the code that uses them exists.
  SUPABASE_URL: z.url().optional(), // Phase 3
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(), // Phase 3
  SUPABASE_DISH_PHOTOS_BUCKET: z.string().default("dish-photos"),
  SUPABASE_MENUS_BUCKET: z.string().default("menus"),
  GOOGLE_PLACES_API_KEY: z.string().optional(), // Phase 2
  ANTHROPIC_API_KEY: z.string().optional(), // Phase 1 matcher skips the LLM step without it
  ANTHROPIC_VISION_MODEL: z.string().optional(), // Phase 5
  ANTHROPIC_MATCH_MODEL: z.string().optional(), // Phase 1
});

export type Env = z.infer<typeof schema>;

/** Names and reasons only; never values. */
export function describeEnvProblems(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
}

export function parseEnv(source: Record<string, string | undefined>): z.ZodSafeParseResult<Env> {
  const cleaned = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, blankToUndefined(v)]),
  );
  return schema.safeParse(cleaned);
}

function loadEnv(): Env {
  const result = parseEnv(process.env);
  if (result.success) return result.data;

  const message = `Invalid or missing environment variables:\n${describeEnvProblems(result.error)}`;
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuild) {
    throw new Error(message);
  }
  console.warn(`[env] ${message}`);
  const partial = schema
    .partial()
    .safeParse(
      Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, blankToUndefined(v)])),
    );
  return (partial.success ? partial.data : {}) as Env;
}

export const env: Env = loadEnv();
