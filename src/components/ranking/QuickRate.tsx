"use client";

// "Rate the places you know" on a dish page. The page stays static: this button reads the session in
// the browser (like the header), and the list and its code load only when it is opened. A signed-out
// visitor goes through sign-in and comes back with the list open.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { authClient } from "@/lib/auth-client";

const OPEN_PARAM = "rate";

const QuickRatePanel = dynamic(() => import("./QuickRatePanel"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">Loading places…</p>,
});

export function QuickRate({ citySlug, dishSlug }: { citySlug: string; dishSlug: string }) {
  const { data } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const signedIn = Boolean(data);
  const path = `/${citySlug}/best-${dishSlug}`;

  // Back from sign-in: open the list once, and take the marker out of the URL.
  useEffect(() => {
    if (!signedIn) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(OPEN_PARAM)) return;
    url.searchParams.delete(OPEN_PARAM);
    window.history.replaceState(null, "", url);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once after sign-in
    setOpen(true);
  }, [signedIn]);

  return (
    <div className="flex flex-col gap-3">
      {signedIn ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide the list" : "Rate the places you know"}
        </Button>
      ) : (
        <ButtonLink
          variant="outline"
          className="self-start"
          href={`/sign-in?callbackUrl=${encodeURIComponent(`${path}?${OPEN_PARAM}=1`)}`}
          prefetch={false}
        >
          Rate the places you know
        </ButtonLink>
      )}
      {open && <QuickRatePanel citySlug={citySlug} dishSlug={dishSlug} />}
    </div>
  );
}
