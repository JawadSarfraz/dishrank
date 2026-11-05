"use client";

// Registers the service worker (public/sw.js) on production builds and keeps the browser's
// install event for the InstallPrompt. Renders nothing.
import { useEffect } from "react";
import { PWA_EVENTS } from "@/lib/pwa-prompt";

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __dishrankInstall?: InstallPromptEvent;
  }
}

export function PwaRegister() {
  useEffect(() => {
    function onInstallable(event: Event) {
      event.preventDefault();
      window.__dishrankInstall = event as InstallPromptEvent;
      window.dispatchEvent(new Event(PWA_EVENTS.installable));
    }
    window.addEventListener("beforeinstallprompt", onInstallable);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => window.removeEventListener("beforeinstallprompt", onInstallable);
  }, []);
  return null;
}
