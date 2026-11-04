"use client";

// Light analytics (Phase 6): a static ranking page tells the server it was viewed, with its city
// and dish only. One small request per page load; nothing is stored in the browser.
import { useEffect } from "react";

export function ViewBeacon({ city, dish }: { city: string; dish: string }) {
  useEffect(() => {
    void fetch("/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "ranking_view", city, dish }),
      keepalive: true,
    }).catch(() => {});
  }, [city, dish]);
  return null;
}
