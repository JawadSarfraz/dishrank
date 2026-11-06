// Tells POST /api/v1/events that something happened (light analytics, docs/06): the event's name and
// at most a city and a dish. Never holds anything about who, and never fails the page.

export type TrackedEvent =
  | { name: "ranking_view" | "share_click"; city: string; dish: string }
  | { name: "sign_in_started" | "in_app_sign_in_started" | "in_app_left_browser" };

export function trackEvent(event: TrackedEvent) {
  void fetch("/api/v1/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true, // survives the page leaving for Google or for Chrome
  }).catch(() => {});
}
