// The browsers inside other apps, where Google refuses its sign-in (disallowed_useragent, docs/10).
// Links opened from WhatsApp land in the phone's own browser, so they never get here. Pure, so the
// tests can read every user agent; the browser's own hook is in use-in-app-browser.ts.

export type InAppBrowser = {
  /** The app, when its browser names itself; `other` for any other embedded browser. */
  app: "instagram" | "messenger" | "facebook" | "tiktok" | "other";
  os: "android" | "ios" | "other";
};

/** Instagram and Messenger first: their user agents can carry Facebook's FB_IAB and FBAN too. */
const APPS: readonly [InAppBrowser["app"], RegExp][] = [
  ["instagram", /\bInstagram\b/i],
  ["messenger", /Orca-Android|Messenger(?:Lite)?ForiOS|FBAN\/FBMessenger|FB_IAB\/MESSENGER/i],
  ["facebook", /FBAN\/|FBAV\/|FB_IAB\/|FBIOS|FB4A/],
  ["tiktok", /musical_ly|trill_|BytedanceWebview|\bTikTok\b/i],
  // Other apps whose built-in browser names itself (2026-11-11): LinkedIn, Snapchat, X, Pinterest,
  // Line, WeChat.
  ["other", /LinkedInApp|Snapchat|\bTwitter\b|Pinterest\/|\bLine\/|MicroMessenger/i],
];

/**
 * Android's own WebView marks itself with "; wv)" (2026-11-11). "Version/4.0" alone is not enough:
 * Xiaomi's and UC's browsers carry it too, and Google signs people in there.
 */
const ANDROID_WEBVIEW = /;\s*wv\)/;

/**
 * On iPhone and iPad every real browser ends in "Safari/…" or names itself (CriOS, FxiOS, EdgiOS,
 * OPiOS, OPT); a WKWebView inside an app has none of it. A page added to the home screen looks the
 * same, so the caller says when the page runs standalone.
 */
const IOS_BROWSER = /Safari\/|CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|Version\//;

export function detectInAppBrowser(
  userAgent: string,
  options: { standalone?: boolean } = {},
): InAppBrowser | null {
  // The installed home-screen app is the phone's own browser, whatever its user agent says.
  if (options.standalone) return null;
  const os = /Android/i.test(userAgent)
    ? "android"
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? "ios"
      : "other";
  const named = APPS.find(([, pattern]) => pattern.test(userAgent))?.[0];
  if (named) return { app: named, os };
  if (os === "android" && ANDROID_WEBVIEW.test(userAgent)) return { app: "other", os };
  if (os === "ios" && /AppleWebKit/.test(userAgent) && !IOS_BROWSER.test(userAgent)) {
    return { app: "other", os };
  }
  return null;
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
