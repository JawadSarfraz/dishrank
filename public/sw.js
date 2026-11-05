/*
 * Kahan Khayen's service worker (docs/12-DESIGN.md, "Installable"). It caches only static files
 * (/_next/static, the icons, the manifest) and the offline page, so the app opens quickly and shows
 * something when the network is gone. It never caches a page with personal data (signed-in, admin,
 * owner pages), an API response or anything else: every other request goes to the network as is.
 */
const VERSION = "2026-11-06";
const CACHE = "dishrank-static-" + VERSION;
const OFFLINE_URL = "/offline";
const STATIC_PREFIXES = ["/_next/static/", "/icons/"];
const STATIC_PATHS = ["/manifest.webmanifest", "/icon.svg", "/apple-icon.png", "/favicon.ico"];
const MAX_ENTRIES = 300;

/** Only hashed build files and the icons: safe to serve from the cache first. */
function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  var path = url.pathname;
  for (var i = 0; i < STATIC_PREFIXES.length; i++) {
    if (path.indexOf(STATIC_PREFIXES[i]) === 0) return true;
  }
  return STATIC_PATHS.indexOf(path) !== -1;
}

/** The build files a page's HTML loads, so the offline page can render without the network. */
function assetUrlsIn(html) {
  var out = [];
  var re = /(?:href|src)="(\/_next\/static\/[^"]+)"/g;
  var m;
  while ((m = re.exec(html))) {
    if (out.indexOf(m[1]) === -1) out.push(m[1]);
  }
  return out;
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    (async function () {
      var cache = await caches.open(CACHE);
      try {
        var res = await fetch(OFFLINE_URL, { cache: "no-store" });
        if (res.ok) {
          var html = await res.text();
          await cache.put(
            OFFLINE_URL,
            new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
          );
          await Promise.all(
            assetUrlsIn(html).map(function (url) {
              return cache.add(url).catch(function () {});
            }),
          );
        }
      } catch {
        // Installed without the offline page; the next install tries again.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      var keys = await caches.keys();
      await Promise.all(
        keys
          .filter(function (key) {
            return key.indexOf("dishrank-static-") === 0 && key !== CACHE;
          })
          .map(function (key) {
            return caches.delete(key);
          }),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  var cache = await caches.open(CACHE);
  var hit = await cache.match(request);
  if (hit) return hit;
  var res = await fetch(request);
  if (res.ok) {
    cache
      .put(request, res.clone())
      .then(function () {
        return trim(cache);
      })
      .catch(function () {});
  }
  return res;
}

/** Keeps the cache small: the oldest entries go once there are too many (hashed files pile up). */
async function trim(cache) {
  var keys = await cache.keys();
  var extra = keys.length - MAX_ENTRIES;
  for (var i = 0; i < extra; i++) {
    if (new URL(keys[i].url).pathname !== OFFLINE_URL) await cache.delete(keys[i]);
  }
}

async function pageOrOffline(request) {
  try {
    return await fetch(request);
  } catch {
    var cache = await caches.open(CACHE);
    var offline = await cache.match(OFFLINE_URL);
    return (
      offline ||
      new Response("You are offline.", { status: 503, headers: { "content-type": "text/plain" } })
    );
  }
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // A page that cannot be reached shows the offline page; the page itself is never cached.
  if (request.mode === "navigate") {
    event.respondWith(pageOrOffline(request));
  }
  // Everything else (API calls, other origins): the network, untouched.
});
