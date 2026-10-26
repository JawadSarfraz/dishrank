import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BetaLabel } from "@/components/layout/BetaLabel";
import { SITE_URL, isBeta } from "@/server/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Relative canonical and Open Graph URLs resolve against the site's own address.
  metadataBase: new URL(SITE_URL),
  title: "DishRank",
  description: "Restaurants ranked dish by dish in Islamabad and Rawalpindi.",
  // Beta (SITE_MODE, docs/10): no page is indexed. Pages that set robots themselves only ever set
  // noindex, and next.config.ts adds an X-Robots-Tag header to every response as well.
  ...(isBeta ? { robots: { index: false, follow: false } } : {}),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {isBeta && <BetaLabel />}
        {children}
      </body>
    </html>
  );
}
