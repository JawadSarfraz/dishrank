// pnpm prod:bootstrap (scripts/prod-bootstrap.ts) changes only the database that DATABASE_URL and
// DIRECT_URL of the shell point at, and only after the person typed its host (and, on Supabase's
// shared poolers, its project ref). Pure checks with no database import, so the script runs them
// before anything connects.
import { AppError } from "@/server/errors";

export type DatabaseTarget = {
  name: string;
  host: string;
  port: string;
  database: string;
  user: string;
  /** The Supabase project, or null for another server. */
  projectRef: string | null;
};

/** Query parameters that node-postgres or the Prisma CLI read as a different connection target. */
const REDIRECTING_PARAMS = [
  "host",
  "hostaddr",
  "port",
  "user",
  "password",
  "dbname",
  "database",
  "service",
];

function refuse(reason: string): never {
  throw new AppError("BOOTSTRAP_REFUSED", `pnpm prod:bootstrap refused: ${reason}`, 400);
}

/**
 * Where one URL points: host, port, database, user and Supabase project, never the password. A URL
 * whose query string names another host, port, user or database is refused, because the driver
 * would connect there instead of where the URL seems to point.
 */
export function describeTarget(name: string, value: string | undefined): DatabaseTarget {
  if (!value) refuse(`${name} is not set in this shell (export it first; .env is never read)`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    refuse(`${name} is not a URL`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    refuse(`${name} is not a PostgreSQL URL`);
  }
  if (!url.hostname) refuse(`${name} has no host name`);
  for (const param of REDIRECTING_PARAMS) {
    if (url.searchParams.has(param)) refuse(`${name} has a ${param}= parameter`);
  }
  const host = url.hostname.toLowerCase();
  const user = decodeURIComponent(url.username);
  // The shared poolers serve every project of a region: the user postgres.<ref> picks the project.
  const pooler = host.endsWith(".pooler.supabase.com");
  const projectRef =
    /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host)?.[1] ??
    (pooler ? (/^[a-z0-9_]+\.([a-z0-9]+)$/.exec(user)?.[1] ?? null) : null);
  if (pooler && !projectRef) {
    refuse(`${name}: on a Supabase pooler the user must be postgres.<project-ref>`);
  }
  return {
    name,
    host,
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres",
    user,
    projectRef,
  };
}

/** Both URLs must reach the same database: one Supabase project, or one host and database. */
export function assertSameDatabase(targets: readonly DatabaseTarget[]) {
  const identity = (t: DatabaseTarget) =>
    t.projectRef ? `Supabase project ${t.projectRef}` : `${t.host}/${t.database}`;
  const distinct = [...new Set(targets.map(identity))];
  if (distinct.length > 1) {
    refuse(`DATABASE_URL and DIRECT_URL point at different databases (${distinct.join(", ")})`);
  }
}

/**
 * What the person must type, each once: the host, and the Supabase project ref too, because one
 * pooler host serves every project of the region.
 */
export function valuesToConfirm(targets: readonly DatabaseTarget[]) {
  const hosts = [...new Set(targets.map((t) => t.host))].map((value) => ({
    label: "database host",
    value,
  }));
  const refs = [...new Set(targets.flatMap((t) => (t.projectRef ? [t.projectRef] : [])))].map(
    (value) => ({ label: "Supabase project ref", value }),
  );
  return [...hosts, ...refs];
}

/** An answer confirms a value only when it is that exact value (spaces and letter case aside). */
export function confirms(answer: string, value: string): boolean {
  return answer.trim().toLowerCase() === value.toLowerCase();
}
