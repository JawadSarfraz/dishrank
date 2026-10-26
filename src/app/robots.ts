// Private and signed-in pages stay out of search engines (docs/08 Phase 4).
import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/server/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/owner", "/me", "/rate", "/sign-in", "/api"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
