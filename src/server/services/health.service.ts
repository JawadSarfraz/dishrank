// GET /api/health for an uptime monitor: does the database answer? The rate-limit write and a
// trivial query share one 3-second budget, so a slow or unreachable database answers 503 after
// about 3 s at most. The answer carries no details; the reason goes to the log.
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { pingDatabase } from "@/server/repositories/ops.repo";

export const HEALTH_TIMEOUT_MS = 3_000;

export type Health = { ok: boolean; status: 200 | 429 | 503 };

class HealthTimeout extends Error {}

/** `ipKey`: the client's IP hash (limit `ip:{hash}:health`). */
export async function checkHealth(
  ipKey: string,
  options: { now?: Date; timeoutMs?: number; ping?: () => Promise<unknown> } = {},
): Promise<Health> {
  const { now = new Date(), timeoutMs = HEALTH_TIMEOUT_MS, ping = pingDatabase } = options;
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HealthTimeout()), timeoutMs);
  });
  const check = async () => {
    await assertRateLimit(`ip:${ipKey}:health`, RATE_LIMITS.health, now);
    await ping();
  };
  try {
    // A query still running after the timeout settles on its own; race() has its rejection handled.
    await Promise.race([check(), timeout]);
    return { ok: true, status: 200 };
  } catch (error) {
    if (error instanceof AppError && error.code === "RATE_LIMITED") {
      return { ok: false, status: 429 };
    }
    const timedOut = error instanceof HealthTimeout;
    logEvent(
      "health.fail",
      {
        reason: timedOut ? "timeout" : "database",
        durationMs: Date.now() - started,
        ...(timedOut ? {} : { error: error instanceof Error ? error.message : String(error) }),
      },
      "error",
    );
    return { ok: false, status: 503 };
  } finally {
    clearTimeout(timer);
  }
}
