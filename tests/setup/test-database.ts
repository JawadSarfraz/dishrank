/**
 * Tests never use the dev database. They run against TEST_DATABASE_URL, or else DATABASE_URL with
 * the database name replaced by `dishrank_test` (same server and user). Anything whose database
 * name does not end in `_test` is refused, so a wrong URL can never be migrated or truncated.
 */
export const TEST_DATABASE_NAME = "dishrank_test";

export function testDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  const explicit = source.TEST_DATABASE_URL;
  const base = explicit || source.DATABASE_URL;
  if (!base) {
    throw new Error("Tests need DATABASE_URL or TEST_DATABASE_URL (see README, Local setup).");
  }
  const url = new URL(base);
  if (!explicit) url.pathname = `/${TEST_DATABASE_NAME}`;
  assertTestDatabaseName(databaseName(url.toString()));
  return url.toString();
}

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

export function assertTestDatabaseName(name: string): void {
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to use database "${name}" for tests: its name must end in _test.`);
  }
}

/** The same server's maintenance database, used only to create the test database. */
export function maintenanceUrl(url: string): string {
  const u = new URL(url);
  u.pathname = "/postgres";
  return u.toString();
}
