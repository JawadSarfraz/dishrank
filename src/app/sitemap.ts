// Only pages worth a search result (docs/08 Phase 4): the home and city pages, ranking pages that
// rank at least one restaurant, and restaurants with at least one counted rating. Thin pages are
// noindex and left out. In beta (SITE_MODE, docs/10) nothing is listed.
import type { MetadataRoute } from "next";
import { absoluteUrl, isBeta } from "@/server/site";
import { listSitemapEntries } from "@/server/services/city-page.service";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isBeta) return [];
  const entries = await listSitemapEntries();
  return entries.map((e) => ({
    url: absoluteUrl(e.path),
    ...(e.lastModified ? { lastModified: e.lastModified } : {}),
  }));
}
