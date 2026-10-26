import "dotenv/config"; // Prisma 7 does not load .env by itself
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // CLI connection (migrate) = DIRECT_URL (docs/10); the seed connects through src/server/db.ts,
  // i.e. DATABASE_URL. Read optionally rather than with `env()`, which throws at config load and
  // would break `prisma generate` (postinstall) on a machine without .env; migrate commands still
  // fail clearly when it is missing.
  datasource: { url: process.env.DIRECT_URL },
});
