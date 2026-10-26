// robots.txt (docs/08 Phase 4): private and signed-in pages stay out of search engines; in beta
// (SITE_MODE, docs/10) everything does.
import type { MetadataRoute } from "next";
import { SITE_MODE, robotsFor } from "@/server/site";

export default function robots(): MetadataRoute.Robots {
  return robotsFor(SITE_MODE);
}
