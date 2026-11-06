"use client";

import { useMemo, useSyncExternalStore } from "react";
import { detectInAppBrowser } from "./in-app-browser";

const noChange = () => () => {};
const readUserAgent = () => navigator.userAgent;
const noUserAgent = () => "";

/** The in-app browser this page runs in, or null; always null on the server and at hydration. */
export function useInAppBrowser() {
  const userAgent = useSyncExternalStore(noChange, readUserAgent, noUserAgent);
  return useMemo(() => detectInAppBrowser(userAgent), [userAgent]);
}
