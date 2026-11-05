// The installable app (owner, Part 3): the manifest names the brand and real icon files, and the
// service worker loads and caches only static files (never a page, an API call or another origin).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { BRAND } from "@/lib/brand";

const ROOT = path.resolve(__dirname, "../../..");

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string) {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("installable app (PWA)", () => {
  it("the manifest comes from the brand config and points at real icons", () => {
    const m = manifest();
    expect(m).toMatchObject({
      name: BRAND.name,
      short_name: BRAND.shortName,
      start_url: "/",
      display: "standalone",
      theme_color: BRAND.themeColor,
      background_color: BRAND.backgroundColor,
    });
    expect(m.icons?.length).toBeGreaterThanOrEqual(3);
    for (const icon of m.icons ?? []) {
      const [w, h] = icon.sizes!.split("x").map(Number);
      expect(pngSize(path.join(ROOT, "public", icon.src))).toEqual({ width: w, height: h });
    }
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("the service worker loads and treats only static files as cacheable", () => {
    const source = fs.readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
    const listeners: Record<string, unknown> = {};
    const context = vm.createContext({
      self: {
        location: { origin: "https://dishrank.example" },
        addEventListener: (name: string, fn: unknown) => {
          listeners[name] = fn;
        },
      },
      URL,
      Response,
      caches: {},
      fetch: () => Promise.reject(new Error("no network in this test")),
    });
    vm.runInContext(source, context);
    expect(Object.keys(listeners).sort()).toEqual(["activate", "fetch", "install"]);
    const isStatic = (url: string) =>
      (context as { isStaticAsset: (u: URL) => boolean }).isStaticAsset(new URL(url));
    for (const url of [
      "https://dishrank.example/_next/static/chunks/app.js",
      "https://dishrank.example/_next/static/media/font.woff2",
      "https://dishrank.example/icons/icon-192.png",
      "https://dishrank.example/manifest.webmanifest",
    ]) {
      expect(isStatic(url), url).toBe(true);
    }
    for (const url of [
      "https://dishrank.example/api/v1/rankings?city=islamabad",
      "https://dishrank.example/api/auth/get-session",
      "https://dishrank.example/me",
      "https://dishrank.example/admin/users",
      "https://dishrank.example/owner",
      "https://dishrank.example/rate",
      "https://dishrank.example/islamabad/best-pizza",
      "https://other.example/_next/static/chunks/app.js",
    ]) {
      expect(isStatic(url), url).toBe(false);
    }
    // The offline page's own build files are read from its HTML at install time.
    const assets = (context as { assetUrlsIn: (html: string) => string[] }).assetUrlsIn(
      '<link href="/_next/static/css/a.css"><script src="/_next/static/chunks/b.js"></script><a href="/me">',
    );
    expect(assets).toEqual(["/_next/static/css/a.css", "/_next/static/chunks/b.js"]);
  });
});
