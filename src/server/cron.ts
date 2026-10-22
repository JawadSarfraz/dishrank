import { timingSafeEqual } from "node:crypto";

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
