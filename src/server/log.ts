/**
 * One JSON line per event (docs/02 Observability: action, userId, entityId, durationMs…). Callers
 * pass ids and counts only: never secrets, request headers or Google request bodies.
 */
export function logEvent(
  action: string,
  fields: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
): void {
  const line = JSON.stringify({ at: new Date().toISOString(), action, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
