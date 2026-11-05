import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { Toaster } from "@/components/ui/toast";
import { BRAND } from "@/lib/brand";
import { SITE_URL, isBeta } from "@/server/site";
import "./globals.css";

// The two faces are committed in src/fonts as variable WOFF2 files (latin subset, OFL 1.1, see
// src/fonts/README.md) and loaded with next/font/local, which serves them from this site
// (/_next/static): neither a page nor a build calls Google. They are not fetched at build time with
// next/font/google because Turbopack's loader fails whenever Google Fonts answers with an
// extensionless font URL (vercel/next.js#99114; it broke the 2026-11-05 deploy). The design uses
// Bricolage Grotesque 700/800 for titles, dish names and numbers and Geist 400/500/700 for
// everything else (docs/12-DESIGN.md); the files carry the whole weight axis. display "fallback":
// the size-adjusted fallback (Arial metrics) paints at once and the real face swaps in only if it
// arrives within about three seconds, so a slow 3G first load never reflows late (CLS); the service
// worker keeps the files for every later visit.
const display = localFont({
  src: "../fonts/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "fallback",
  adjustFontFallback: "Arial",
});

const sans = localFont({
  src: "../fonts/geist-latin-wght-normal.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "fallback",
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  // Relative canonical and Open Graph URLs resolve against the site's own address.
  metadataBase: new URL(SITE_URL),
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: BRAND.shortName, statusBarStyle: "default" },
  // Beta (SITE_MODE, docs/10): no page is indexed. Pages that set robots themselves only ever set
  // noindex, and next.config.ts adds an X-Robots-Tag header to every response as well.
  ...(isBeta ? { robots: { index: false, follow: false } } : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: BRAND.themeColor,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Toaster>
          <SiteHeader beta={isBeta} />
          {children}
          <PwaRegister />
          <InstallPrompt />
        </Toaster>
      </body>
    </html>
  );
}
