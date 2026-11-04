// Dev-only scripts (docs/11 Security): they refuse to run in production (NODE_ENV=production) and
// on Vercel. pnpm dev:demo checks more (a database on this machine only, dev-demo-guard.ts).

/** Why a dev-only script must not run here, or null when it may. */
export function devOnlyRefusal(env: Readonly<Record<string, string | undefined>>): string | null {
  if (env.NODE_ENV === "production") return "NODE_ENV is production";
  if (env.VERCEL || env.VERCEL_ENV) return "this is a Vercel environment";
  return null;
}
