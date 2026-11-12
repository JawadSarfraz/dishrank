import type { Metadata, Viewport } from "next";
import { SourceTag } from "@/components/analytics/SourceTag";
import { UrduNameDefs } from "@/components/brand/Logo";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { TabBar } from "@/components/layout/TabBar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { Toaster } from "@/components/ui/toast";
import { BRAND } from "@/lib/brand";
import { htmlClassName } from "./fonts";
import { SITE_URL, isBeta } from "@/server/site";
import "./globals.css";

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
    <html lang="en" className={htmlClassName}>
      <body className="flex min-h-full flex-col pb-tabbar">
        <UrduNameDefs />
        <Toaster>
          <SiteHeader beta={isBeta} />
          {children}
          <PwaRegister />
          <InstallPrompt />
          <SourceTag />
          <TabBar />
        </Toaster>
      </body>
    </html>
  );
}
