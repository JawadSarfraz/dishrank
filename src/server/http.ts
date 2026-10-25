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

/**
 * The JSON body of a write request. Writes authenticated by the session cookie accept only
 * `application/json`, which a cross-site form cannot send (defence in depth next to SameSite=Lax).
 */
export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Send JSON (Content-Type: application/json)", 415);
  }
  try {
    return await request.json();
  } catch {
    throw new AppError("INVALID_JSON", "The body is not valid JSON", 400);
  }
}
