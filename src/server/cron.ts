import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";

function deny(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Guard for /api/cron/*: fails closed. Returns a Response to send back when the request must be
 * refused, or null when the bearer token matches CRON_SECRET (constant-time comparison).
 */
export function requireCronSecret(request: Request, secret: string | undefined): Response | null {
  if (!secret) {
    console.error("[cron] refused: CRON_SECRET is not set");
    return deny(500, "CRON_SECRET_MISSING", "Cron secret is not configured");
  }
  const given = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return deny(401, "UNAUTHORIZED", "Invalid cron credentials");
  }
  return null;
}

/**
 * docs/06 Cron: a job that threw answers `{ ok: false, error }`: 409 JOB_RUNNING while another run
 * is going, otherwise 500 INTERNAL (the details are in the JobRun and the log).
 */
export function cronFailure(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  logEvent("cron.failed", { error: message }, "error");
  return Response.json({ ok: false, error: { code: "INTERNAL", message } }, { status: 500 });
}
