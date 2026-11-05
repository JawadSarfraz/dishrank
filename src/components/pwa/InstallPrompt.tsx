"use client";

// "Add DishRank to your home screen": a small card at the bottom, after the second rating or the
// second visit (src/lib/pwa-prompt.ts). One tap dismisses it for 30 days. On iPhone there is no
// install event, so it shows the Share → Add to Home Screen steps instead. No push notifications.
import { ShareIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import {
  PWA_EVENTS,
  dismissInstall,
  isIos,
  markInstalled,
  noteVisit,
  shouldOfferInstall,
} from "@/lib/pwa-prompt";

type Mode = "hidden" | "native" | "ios";

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>("hidden");

  useEffect(() => {
    noteVisit();
    function decide() {
      if (!shouldOfferInstall()) return setMode("hidden");
      if (window.__dishrankInstall) return setMode("native");
      if (isIos()) return setMode("ios");
      setMode("hidden");
    }
    function onInstalled() {
      markInstalled();
      setMode("hidden");
    }
    decide();
    window.addEventListener(PWA_EVENTS.installable, decide);
    window.addEventListener(PWA_EVENTS.rated, decide);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener(PWA_EVENTS.installable, decide);
      window.removeEventListener(PWA_EVENTS.rated, decide);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "hidden") return null;

  function dismiss() {
    dismissInstall();
    setMode("hidden");
  }

  async function install() {
    const event = window.__dishrankInstall;
    if (!event) return dismiss();
    await event.prompt();
    const choice = await event.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    window.__dishrankInstall = undefined;
    if (choice.outcome === "accepted") markInstalled();
    else dismissInstall();
    setMode("hidden");
  }

  return (
    <section
      aria-label={`Add ${BRAND.name} to your home screen`}
      className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md flex-col gap-3 rounded-2xl border bg-card p-4 shadow-raised animate-in slide-in-from-bottom-4 fade-in-0 duration-300 sm:inset-x-auto sm:right-4 sm:bottom-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <LogoMark size={28} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-display text-lg leading-tight font-bold">
            Add {BRAND.name} to your home screen
          </p>
          <p className="text-sm text-muted-foreground">
            {mode === "ios" ? (
              <>
                In Safari, tap{" "}
                <ShareIcon aria-hidden="true" className="inline size-4 align-text-bottom" />{" "}
                <span className="font-medium text-foreground">Share</span>, then{" "}
                <span className="font-medium text-foreground">Add to Home Screen</span>.
              </>
            ) : (
              "Opens like an app, straight to the rankings. No store, no notifications."
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Not now"
          onClick={dismiss}
          className="-mt-1 -mr-1 shrink-0"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <div className="flex gap-2">
        {mode === "native" ? (
          <>
            <Button type="button" onClick={install} className="flex-1">
              Add
            </Button>
            <Button type="button" variant="outline" onClick={dismiss}>
              Not now
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" onClick={dismiss} className="flex-1">
            Got it
          </Button>
        )}
      </div>
    </section>
  );
}
