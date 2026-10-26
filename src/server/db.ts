import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/env";

// Runtime connection = DATABASE_URL (Supabase: Supavisor transaction pooler, docs/10).
// With a driver adapter, node-postgres owns the pool; keep it small for serverless functions.
function createClient(url: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: url,
    max: 3,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

/**
 * Without a URL node-postgres would fall back to PGHOST/PGDATABASE or localhost:5432, so there is no
 * client at all: every use throws. Importing still works, so `next build` without a database keeps
 * going (pages that read data fall back or fail on their own, docs/OPEN-QUESTIONS Phase 0).
 */
function missingClient(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      if (property === "then") return undefined; // not a thenable
      throw new Error(
        "DATABASE_URL is missing or invalid (see the [env] warning): no database client.",
      );
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Prisma client singleton. Only repositories (src/server/repositories) may import it. */
export const db =
  globalForPrisma.prisma ?? (env.DATABASE_URL ? createClient(env.DATABASE_URL) : missingClient());

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
