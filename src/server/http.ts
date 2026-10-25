// Route handler helpers: the docs/06 response envelope `{ data }` / `{ error: { code, message, details? } }`.
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";

export function jsonData(data: unknown, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

export function jsonError(error: unknown): Response {
  if (error instanceof AppError) {
    const body = {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
    return Response.json({ error: body }, { status: error.status });
  }
  logEvent("api.error", { error: error instanceof Error ? error.message : String(error) }, "error");
  return Response.json(
    { error: { code: "INTERNAL", message: "Something went wrong" } },
    { status: 500 },
  );
}
