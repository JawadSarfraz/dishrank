"use client";

import { useState } from "react";

/**
 * "Near me": asks for the location only when tapped and never sends it anywhere; the distances are
 * worked out in the browser.
 */
export function useNearMe() {
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "failed">("idle");

  function locate(onFound?: () => void) {
    if (!("geolocation" in navigator)) {
      setLocating("failed");
      return;
    }
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating("idle");
        onFound?.();
      },
      () => setLocating("failed"),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  return { here, locating, locate };
}
