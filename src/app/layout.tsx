import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Toaster } from "@/components/ui/toast";
import { BRAND } from "@/lib/brand";
import { SITE_URL, isBeta } from "@/server/site";
import "./globals.css";

// next/font downloads the font files at build time and serves them from this site (/_next/static):
// a page never calls Google. Only the weights the design uses, latin subset (docs/12-DESIGN.md):
// Bricolage Grotesque 700/800 for titles, dish names and numbers; Geist 400/500/700 for everything
// else. display "fallback": the size-adjusted fallback paints at once and the real face swaps in
// only if it arrives within about three seconds, so a slow 3G first load never reflows late (CLS);
// the service worker keeps the files for every later visit.
const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "fallback",
});

const sans = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "fallback",
});

export const metadata: Metadata = {
  // Relative canonical and Open Graph URLs resolve against the site's own address.
  metadataBase: new URL(SITE_URL),
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
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
        </Toaster>
      </body>
    </html>
  );
}
