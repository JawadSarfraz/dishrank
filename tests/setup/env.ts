// Runs in every test worker before the test file: load .env, then point the app's database
// variables at the test database so `@/server/db` never connects to the dev database.
import "dotenv/config";
import { testDatabaseUrl } from "./test-database";

const url = testDatabaseUrl();
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
