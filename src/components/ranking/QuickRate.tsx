"use client";

// "Rate the places you know" on a dish page. The page stays static: the list and its code load only
// when it is opened, and ask the server who is looking. A signed-out visitor sees the same list and
// signs in after tapping a score (QuickRatePanel). While it is open it stands in for the page's own
// lists (its children), so no place appears twice; the server's shuffle seed comes along, so the
// contenders keep the order the page showed.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const OPEN_PARAM = "rate";

const QuickRatePanel = dynamic(() => import("./QuickRatePanel"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">Loading places…</p>,
});

export function QuickRate({
  citySlug,
  dishSlug,
  seed,
  children,
}: {
  citySlug: string;
  dishSlug: string;
  seed: string;
  /** The ranking, the waiting list and the contenders: shown while the panel is closed. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // From an invite link, or from "Rate more places": open the list once, and take the marker out
  // of the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(OPEN_PARAM)) return;
    url.searchParams.delete(OPEN_PARAM);
    window.history.replaceState(null, "", url);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once after load
    setOpen(true);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant={open ? "outline" : "default"}
        size="lg"
        className="self-start"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide the list" : "Rate the places you know"}
      </Button>
      {open ? <QuickRatePanel citySlug={citySlug} dishSlug={dishSlug} seed={seed} /> : children}
    </div>
  );
}
