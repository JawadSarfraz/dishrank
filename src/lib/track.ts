// Tells POST /api/v1/events that something happened (light analytics, docs/06): the event's name, at
// most a city and a dish, and the visit's source tag (docs/01 D1b). Never holds anything about who,
// and never fails the page.
import { sourceFromCookies } from "./source-tag";

export type TrackedEvent =
  | { name: "ranking_view" | "share_click"; city: string; dish: string }
  | { name: "sign_in_started" | "in_app_sign_in_started" | "in_app_left_browser" };

function visitSource(): string | null {
  try {
    return sourceFromCookies(document.cookie);
  } catch {
    return null;
  }
}

export function trackEvent(event: TrackedEvent) {
  const source = visitSource();
  void fetch("/api/v1/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(source ? { ...event, source } : event),
    keepalive: true, // survives the page leaving for Google or for Chrome
  }).catch(() => {});
}
