// The web app manifest (owner, Part 3: Kahan Khayen installs as an app). Everything comes from the
// brand config; the icons are built by `pnpm icons:build` (scripts/make-icons.ts).
//
// Each icon URL carries a hash of the file (?v=…), so a new icon is a new URL: an installed app
// (Chrome's WebAPK on Android) sees a changed manifest at its next update check and fetches the new
// icon instead of reusing the one it, or the service worker, cached under the old URL (2026-11-14:
// the red icons did not reach installed apps). Read once at build time; the route is static.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/** "/icons/icon-192.png?v=1a2b3c4d5e": the public file's path with a hash of its bytes. */
export function versionedIcon(src: string): string {
  const bytes = readFileSync(path.join(process.cwd(), "public", src));
  return `${src}?v=${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}`;
}

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BRAND.backgroundColor,
    theme_color: BRAND.themeColor,
    lang: "en",
    dir: "ltr",
    categories: ["food"],
    icons: [
      { src: versionedIcon("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: versionedIcon("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
      {
        src: versionedIcon("/icons/maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
