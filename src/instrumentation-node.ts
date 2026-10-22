// Node.js-only startup check (imported from src/instrumentation.ts).
try {
  await import("./env");
} catch (error) {
  console.error(`[startup] ${error instanceof Error ? error.message : String(error)}`);
  // Fail fast: a production server must not keep running with a broken environment.
  if (process.env.NODE_ENV === "production") process.exit(1);
  throw error;
}

export {};
