// Only pages worth a search result (docs/01 D1c): the home and city pages, ranking pages with at
// least three ranked restaurants, and restaurants with at least one ranked dish (INDEX_RULES). Thin
// pages are noindex and left out. In beta (SITE_MODE, docs/10) nothing is listed.
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
