"use client";

import { useMemo, useSyncExternalStore } from "react";
import { detectInAppBrowser } from "./in-app-browser";
import { isStandalone } from "./pwa-prompt";

const noChange = () => () => {};
const readUserAgent = () => navigator.userAgent;
const noUserAgent = () => "";

/**
 * The in-app browser this page runs in, or null; always null on the server, at hydration, and in
 * the installed home-screen app (whose user agent can look like a WebView on iPhone).
 */
export function useInAppBrowser() {
  const userAgent = useSyncExternalStore(noChange, readUserAgent, noUserAgent);
  return useMemo(
    () => (userAgent ? detectInAppBrowser(userAgent, { standalone: isStandalone() }) : null),
    [userAgent],
  );
}
