// Runs once when a Next.js server starts. The Node.js part validates the environment, so a
// production server with a missing or malformed required variable stops before serving.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
