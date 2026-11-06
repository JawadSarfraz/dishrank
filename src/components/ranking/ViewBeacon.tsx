"use client";

// Light analytics (Phase 6): a static ranking page tells the server it was viewed, with its city
// and dish only. One small request per page load; nothing is stored in the browser.
import { useEffect } from "react";
import { trackEvent } from "@/lib/track";

export function ViewBeacon({ city, dish }: { city: string; dish: string }) {
  useEffect(() => trackEvent({ name: "ranking_view", city, dish }), [city, dish]);
  return null;
}
