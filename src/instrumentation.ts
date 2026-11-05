import type { Instrumentation } from "next";

// Runs once when a Next.js server starts. The Node.js part validates the environment, so a
// production server with a missing or malformed required variable stops before serving.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

/**
 * Errors Next.js catches itself (a page that fails to render, a handler that throws): into the error
 * log under the route's pattern, never the real path, which can hold ids or an invite token.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordServerError } = await import("./server/error-log");
  const { digest } = (error ?? {}) as { digest?: unknown };
  await recordServerError({
    route: context.routePath || context.routeType,
    error,
    digest: typeof digest === "string" ? digest : undefined,
  });
};
