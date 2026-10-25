import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/env";

// Runtime connection = DATABASE_URL (Supabase: Supavisor transaction pooler, docs/10).
// With a driver adapter, node-postgres owns the pool; keep it small for serverless functions.
function createClient(): PrismaClient {
  // Without a URL node-postgres would fall back to PGHOST/PGDATABASE or localhost:5432: never guess.
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is missing or invalid (see the [env] warning); no database client.",
    );
  }
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Prisma client singleton. Only repositories (src/server/repositories) may import it. */
export const db = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
