// The minimal error log (docs/02 Observability): unexpected server errors in a small table, the last
// 50 shown on /admin, deleted after 30 days. Hobby keeps an hour of logs, so this is what is still
// there the next morning. It holds the route pattern, the error's name, a short scrubbed message and
// Next.js's digest, never a user, a path with ids, a header or a query. Writing it never throws and
// never holds up an answer for long: a database that is down must not make an error worse.
import { logEvent } from "@/server/log";
import { insertServerError } from "@/server/repositories/ops.repo";

export const ERROR_LOG = { keepDays: 30, shown: 50 } as const;

const MAX = { route: 120, name: 60, message: 200, digest: 40 } as const;
/** Writes per server instance per minute: a broken page under load must not fill the table. */
const MAX_PER_MINUTE = 20;
const WRITE_TIMEOUT_MS = 1500;

/** Whatever in an error's text could point at a person or a secret. */
function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]")
    .replace(/\+?\d[\d\s()-]{6,}\d/g, "[number]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[id]")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prisma's text can quote the data of the query that failed, so only its code is kept. */
function messageOf(error: unknown, name: string): string {
  if (name.startsWith("PrismaClient")) {
    const { code } = error as { code?: unknown };
    return typeof code === "string" ? `database error ${code}` : "database error";
  }
  const text = error instanceof Error ? error.message : String(error);
  return scrub(text).slice(0, MAX.message) || "(no message)";
}

/** Errors that are how Next.js works, or a request we answered on purpose. */
function isExpected(error: unknown, digest: string | undefined): boolean {
  if (digest?.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE") return true;
  if (digest?.startsWith("BAILOUT_TO_CLIENT_SIDE_RENDERING")) return true;
  const { name, status } = (error ?? {}) as { name?: unknown; status?: unknown };
  return name === "AppError" && typeof status === "number" && status < 500;
}

let windowStart = 0;
let written = 0;

function withinLimit(now: number): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now;
    written = 0;
  }
  written += 1;
  return written <= MAX_PER_MINUTE;
}

/** Records one unexpected error. `route` is a pattern ("/api/v1/ratings", "/[city]/[slug]"), never a real path. */
export async function recordServerError(input: {
  route: string;
  error: unknown;
  digest?: string;
}): Promise<void> {
  const digest = input.digest?.slice(0, MAX.digest);
  if (isExpected(input.error, digest)) return;
  const name = (input.error instanceof Error ? input.error.name : "Error").slice(0, MAX.name);
  if (!withinLimit(Date.now())) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      insertServerError({
        route: input.route.slice(0, MAX.route),
        name,
        message: messageOf(input.error, name),
        digest: digest ?? null,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), WRITE_TIMEOUT_MS);
      }),
    ]);
  } catch (failure) {
    logEvent(
      "error_log.write_failed",
      { route: input.route, failure: failure instanceof Error ? failure.name : "unknown" },
      "error",
    );
  } finally {
    clearTimeout(timer);
  }
}
