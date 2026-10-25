// pnpm dev:demo writes demo data only into a database on this machine. Pure checks, with no
// database import, so scripts/dev-demo.ts runs them before anything connects.
import { AppError } from "@/server/errors";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function refuse(reason: string): never {
  throw new AppError("DEMO_REFUSED", `pnpm dev:demo refused: ${reason}`, 400);
}

/**
 * Never with NODE_ENV=production, never on Vercel, and only when DATABASE_URL (and DIRECT_URL, when
 * set) point at localhost or a local socket, `host=` parameters included (node-postgres uses the
 * last one). Pass the values the database client really uses (src/env.ts). Returns the target for
 * the log line: host and database name, never credentials.
 */
export function assertLocalDatabase(env: Readonly<Record<string, string | undefined>>) {
  if (env.NODE_ENV === "production") refuse("NODE_ENV is production");
  if (env.VERCEL || env.VERCEL_ENV) refuse("this is a Vercel environment");
  if (!env.DATABASE_URL) refuse("DATABASE_URL is not set (or src/env.ts rejected it)");
  let target: { host: string; database: string } | null = null;
  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const value = env[name];
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      refuse(`${name} is not a URL`);
    }
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      refuse(`${name} is not a PostgreSQL URL`);
    }
    const hostParams = url.searchParams.getAll("host");
    for (const host of hostParams) {
      if (!host.startsWith("/") && !LOCAL_HOSTS.has(host)) {
        refuse(`${name} points at ${host}, not at this machine`);
      }
    }
    if (url.hostname === "" ? hostParams.length === 0 : !LOCAL_HOSTS.has(url.hostname)) {
      refuse(`${name} points at ${url.hostname || "no host"}, not at this machine`);
    }
    target ??= {
      host: `${hostParams.at(-1) ?? url.hostname}:${url.port || "5432"}`,
      database: decodeURIComponent(url.pathname.slice(1)),
    };
  }
  return target!;
}

/** The server address of a live connection: NULL for a Unix socket, else it must be loopback. */
export function assertLocalServerAddress(address: string | null) {
  if (address !== null && address !== "127.0.0.1" && address !== "::1") {
    refuse(`the database connection reaches ${address}, not this machine`);
  }
}
