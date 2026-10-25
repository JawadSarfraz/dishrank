// Server actions answer `{ data }` or `{ error: { code, message, details? } }` (docs/06), never throw.
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";

export type ActionError = { code: string; message: string; details?: unknown };
export type ActionResult<T> =
  { data: T; error?: undefined } | { data?: undefined; error: ActionError };

export async function runAction<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { data: await fn() };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      };
    }
    logEvent(
      "action.error",
      { action: name, error: error instanceof Error ? error.message : String(error) },
      "error",
    );
    return { error: { code: "INTERNAL", message: "Something went wrong. Try again." } };
  }
}
