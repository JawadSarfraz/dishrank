// Google refuses its sign-in inside these browsers, so a missed one is a dead end for the visitor,
// and a false alarm sends a working browser away from "Continue with Google".
import { describe, expect, it } from "vitest";
import {
  cameFromInAppBrowser,
  chromeIntentUrl,
  detectInAppBrowser,
  escapedPageUrl,
} from "@/lib/in-app-browser";

const ANDROID =
  "Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

describe("detectInAppBrowser", () => {
  it.each([
    ["Facebook, Android", `${ANDROID} [FB_IAB/FB4A;FBAV/486.0.0.66.70;]`, "facebook", "android"],
    [
      "Facebook, iPhone",
      `${IPHONE} [FBAN/FBIOS;FBAV/486.0.0.40.97;FBBV/665000000;FBDV/iPhone14,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]`,
      "facebook",
      "ios",
    ],
    [
      "Messenger, Android",
      `${ANDROID} [FB_IAB/Orca-Android;FBAV/480.0.0.47.109;]`,
      "messenger",
      "android",
    ],
    [
      "Messenger, iPhone",
      `${IPHONE} [FBAN/MessengerForiOS;FBAV/482.0.0.28.109;FBDV/iPhone14,2;FBSN/iOS;FBSV/18.1]`,
      "messenger",
      "ios",
    ],
    [
      "Instagram, Android",
      `${ANDROID} Instagram 356.0.0.41.101 Android (33/13; 450dpi; 1080x2220; samsung; SM-A135F; a13; exynos850; en_PK; 656000000)`,
      "instagram",
      "android",
    ],
    [
      "Instagram, iPhone",
      `${IPHONE} Instagram 356.0.0.21.102 (iPhone14,2; iOS 18_1; en_PK; en; scale=3.00; 1170x2532; 656000000)`,
      "instagram",
      "ios",
    ],
    [
      "Instagram with Facebook's mark",
      `${ANDROID} [FB_IAB/Instagram;FBAV/356.0.0.41.101;]`,
      "instagram",
      "android",
    ],
    [
      "TikTok, Android",
      `${ANDROID} musical_ly_2024200030 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/42.0.3 ByteLocale/en Region/PK BytedanceWebview/d8a21c6`,
      "tiktok",
      "android",
    ],
    [
      "TikTok from the Asian build, Android",
      `${ANDROID} trill_2024200030 JsSdk/1.0 NetType/4G Channel/googleplay AppName/trill app_version/42.0.3 Region/PK`,
      "tiktok",
      "android",
    ],
    [
      "TikTok, iPhone",
      `${IPHONE} musical_ly_42.0.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/PK WKWebView/1 BytedanceWebview/d8a21c6`,
      "tiktok",
      "ios",
    ],
  ])("finds %s", (_label, userAgent, app, os) => {
    expect(detectInAppBrowser(userAgent)).toEqual({ app, os });
  });

  it.each([
    [
      "Chrome on Android",
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
    ],
    [
      "Samsung Internet",
      "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
    ],
    [
      "Safari on iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    ],
    [
      "Chrome on a laptop",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    ],
    ["no user agent", ""],
  ])("leaves %s alone", (_label, userAgent) => {
    expect(detectInAppBrowser(userAgent)).toBeNull();
  });
});

describe("leaving an in-app browser", () => {
  const page =
    "https://kahankhayen.com/rate?city=islamabad&r=butt-karahi-f-8&d=chicken-karahi&score=8";

  it("goes to the same page in Chrome, with its query and the mark", () => {
    expect(chromeIntentUrl(escapedPageUrl(page))).toBe(
      "intent://kahankhayen.com/rate?city=islamabad&r=butt-karahi-f-8&d=chicken-karahi&score=8&via=in-app#Intent;scheme=https;package=com.android.chrome;end",
    );
  });

  it("the page in the other browser knows where it came from", () => {
    expect(cameFromInAppBrowser(new URL(escapedPageUrl(page)).search)).toBe(true);
    expect(cameFromInAppBrowser(new URL(page).search)).toBe(false);
  });

  it("marks a page once, however often it is left", () => {
    expect(escapedPageUrl(escapedPageUrl(page)).match(/via=/g)).toHaveLength(1);
  });
});
