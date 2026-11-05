/**
 * One JSON line per event (docs/02 Observability: action, userId, entityId, durationMs…). Callers
 * pass ids and counts only: never secrets or request headers. The event name always wins: a field
 * called `action` or `at` can never replace it (audit 2026-11, B-01).
 */
export function logEvent(
  action: string,
  fields: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
): void {
  const line = JSON.stringify({ ...fields, at: new Date().toISOString(), action });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
