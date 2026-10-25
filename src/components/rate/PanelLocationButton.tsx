"use client";

// Panel members only (docs/07 §7): "I'm at this restaurant now". The browser asks for permission
// each time it is pressed; only a fix of 50 m or better is sent, and it is kept apart from the rating.
import { useState } from "react";
import { describeActionError } from "@/components/admin/action-error";
import { Button } from "@/components/ui/button";
import { recordLocationAction } from "@/server/actions/rating";

const MAX_ACCURACY_M = 50;

export function PanelLocationButton({ restaurantId }: { restaurantId: string }) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  function share() {
    if (!("geolocation" in navigator)) {
      setMessage({ text: "This browser cannot share a location.", error: true });
      return;
    }
    setBusy(true);
    setMessage({ text: "Finding your location…", error: false });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const accuracyM = Math.round(pos.coords.accuracy);
        if (accuracyM > MAX_ACCURACY_M) {
          setBusy(false);
          setMessage({
            text: `Not accurate enough (±${accuracyM} m, needs 50 m or better). Try again outside, or wait a moment.`,
            error: true,
          });
          return;
        }
        const res = await recordLocationAction({
          restaurantId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Math.max(1, accuracyM),
        });
        setBusy(false);
        setMessage(
          res.error
            ? { text: describeActionError(res.error), error: true }
            : { text: `Location saved (±${accuracyM} m). Thank you!`, error: false },
        );
      },
      (err) => {
        setBusy(false);
        setMessage({
          text:
            err.code === err.PERMISSION_DENIED
              ? "Location permission was not given."
              : "Your location could not be found. Try again.",
          error: true,
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed p-3">
      <Button type="button" variant="outline" onClick={share} disabled={busy} className="h-11">
        I&apos;m at this restaurant now – share location
      </Button>
      <p className="text-xs text-muted-foreground">
        Panel only. Helps us place the restaurant on the map; it is not part of your rating.
      </p>
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={message.error ? "text-sm text-destructive" : "text-sm"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
