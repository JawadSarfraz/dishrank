import { z } from "zod";
import { hasSslMode, isSupabaseHost } from "./server/db-ssl";

/**
 * The environment schema (docs/10 lists every variable), without side effects: src/env.ts checks
 * process.env with it when a server starts, and scripts/vercel-build.ts before a build migrates
 * anything. Nothing here ever prints a value.
 */
const postgresUrl = z.string().regex(/^postgres(ql)?:\/\//, "must be a postgresql:// URL");
// node-postgres lets a URL's sslmode replace the verified TLS the app sets up for Supabase, and
// sslmode=require then fails against Supabase's private CA (src/server/db-ssl.ts, docs/10).
const runtimeUrl = postgresUrl.refine((url) => !(isSupabaseHost(url) && hasSslMode(url)), {
  message: "remove sslmode: the app verifies Supabase's certificate itself (docs/10)",
});
const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: runtimeUrl,
  DIRECT_URL: postgresUrl,

  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ADMIN_EMAIL: z.email().optional(),

  CRON_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Keys the hash of client IPs in rate-limit keys (never the raw IP); its own secret, so rotating
  // the auth secret never changes it (Phase 6, docs/10).
  IP_HASH_SECRET: z.string().min(32, "must be at least 32 characters"),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  // beta: noindex everywhere, robots.txt disallows all, "Beta" label. Unset = beta in production
  // and live elsewhere (src/lib/site-mode.ts). Read at build time: change it, then redeploy.
  SITE_MODE: z.enum(["beta", "live"]).optional(),
  // Beta only: the Google accounts (comma-separated e-mails) that may create an account, besides
  // ADMIN_EMAIL. Google's "Testing" status does not limit plain Sign in with Google.
  BETA_ALLOWED_EMAILS: z.string().optional(),
  // Who runs the site, named on /privacy and /terms (placeholders show when unset).
  OPERATOR_NAME: z.string().trim().min(1).max(120).optional(),
  CONTACT_EMAIL: z.email().optional(),

  // Needed from later phases; optional until the code that uses them exists.
  SUPABASE_URL: z.url().optional(), // Phase 3
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(), // Phase 3
  SUPABASE_DISH_PHOTOS_BUCKET: z.string().default("dish-photos"),
  SUPABASE_MENUS_BUCKET: z.string().default("menus"),
  // Phase 3 photo uploads through Supabase's S3 protocol (10-minute presigned URLs). All four or
  // none: without them the rate flow hides the photo step.
  SUPABASE_S3_ENDPOINT: z.url().optional(),
  SUPABASE_S3_REGION: z.string().optional(),
  SUPABASE_S3_ACCESS_KEY_ID: z.string().optional(),
  SUPABASE_S3_SECRET_ACCESS_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(), // Phase 1 matcher skips the LLM step without it
  ANTHROPIC_VISION_MODEL: z.string().optional(), // Phase 5
  ANTHROPIC_MATCH_MODEL: z.string().optional(), // Phase 1
});

export type Env = z.infer<typeof schema>;

/**
 * One line per variable: "NAME: missing" when it is unset or blank, otherwise "NAME: invalid" with
 * the schema's own messages. Names and reasons only; never values.
 */
export function describeEnvProblems(
  error: z.ZodError,
  source: Record<string, string | undefined>,
): string {
  const reasons = new Map<string, string[]>();
  for (const issue of error.issues) {
    const name = issue.path.join(".");
    reasons.set(name, [...(reasons.get(name) ?? []), issue.message]);
  }
  return [...reasons]
    .map(([name, messages]) =>
      blankToUndefined(source[name]) === undefined
        ? `  - ${name}: missing`
        : `  - ${name}: invalid (${messages.join("; ")})`,
    )
    .join("\n");
}

/**
 * Outside production: every variable that is valid on its own, so one malformed optional value
 * never hides the others (a missing DATABASE_URL would make node-postgres guess a server).
 */
export function validVariables(source: Record<string, string | undefined>): Partial<Env> {
  const valid: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const parsed = (field as z.ZodType).safeParse(blankToUndefined(source[key]));
    if (parsed.success && parsed.data !== undefined) valid[key] = parsed.data;
  }
  return valid as Partial<Env>;
}

export function parseEnv(source: Record<string, string | undefined>): z.ZodSafeParseResult<Env> {
  const cleaned = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, blankToUndefined(v)]),
  );
  return schema.safeParse(cleaned);
}
