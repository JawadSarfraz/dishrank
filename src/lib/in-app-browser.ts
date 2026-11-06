// The browsers inside other apps, where Google refuses its sign-in (disallowed_useragent, docs/10).
// Links opened from WhatsApp land in the phone's own browser, so they never get here. Pure, so the
// tests can read every user agent; the browser's own hook is in use-in-app-browser.ts.

export type InAppBrowser = {
  app: "instagram" | "messenger" | "facebook" | "tiktok";
  os: "android" | "ios" | "other";
};

/** Instagram and Messenger first: their user agents can carry Facebook's FB_IAB and FBAN too. */
const APPS: readonly [InAppBrowser["app"], RegExp][] = [
  ["instagram", /\bInstagram\b/i],
  ["messenger", /Orca-Android|Messenger(?:Lite)?ForiOS|FBAN\/FBMessenger|FB_IAB\/MESSENGER/i],
  ["facebook", /FBAN\/|FBAV\/|FB_IAB\/|FBIOS|FB4A/],
  ["tiktok", /musical_ly|trill_|BytedanceWebview|\bTikTok\b/i],
];

export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  const app = APPS.find(([, pattern]) => pattern.test(userAgent))?.[0];
  if (!app) return null;
  const os = /Android/i.test(userAgent)
    ? "android"
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? "ios"
      : "other";
  return { app, os };
}

const ESCAPED_PARAM = "via";
const ESCAPED_VALUE = "in-app";

/** This page, marked so that a sign-in from it counts as one that began in an in-app browser. */
export function escapedPageUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.set(ESCAPED_PARAM, ESCAPED_VALUE);
  return url.toString();
}

export const cameFromInAppBrowser = (search: string) =>
  new URLSearchParams(search).get(ESCAPED_PARAM) === ESCAPED_VALUE;

/** The same page in Chrome on Android: an in-app browser hands an intent:// link to the system. */
export function chromeIntentUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  const scheme = url.protocol.replace(":", "");
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;end`;
}
