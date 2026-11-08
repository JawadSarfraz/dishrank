// The two faces are committed in src/fonts as variable WOFF2 files (latin subset, OFL 1.1, see
// src/fonts/README.md) and loaded with next/font/local, which serves them from this site
// (/_next/static): neither a page nor a build calls Google. They are not fetched at build time with
// next/font/google because Turbopack's loader fails whenever Google Fonts answers with an
// extensionless font URL (vercel/next.js#99114; it broke the 2026-11-05 deploy). The design uses
// Bricolage Grotesque 700/800 for titles, dish names and numbers and Geist 400/500/700 for
// everything else (docs/12-DESIGN.md); the files carry the whole weight axis. display "fallback":
// the size-adjusted fallback (Arial metrics) paints at once and the real face swaps in only if it
// arrives within about three seconds, so a slow 3G first load never reflows late (CLS); the service
// worker keeps the files for every later visit. Shared by the root layout and global-error.tsx,
// which has no layout to inherit from.
import localFont from "next/font/local";

export const display = localFont({
  src: "../fonts/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "fallback",
  adjustFontFallback: "Arial",
});

export const sans = localFont({
  src: "../fonts/geist-latin-wght-normal.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "fallback",
  adjustFontFallback: "Arial",
});

/** The classes on <html>: the font variables, full height, antialiasing. */
export const htmlClassName = `${sans.variable} ${display.variable} h-full antialiased`;
