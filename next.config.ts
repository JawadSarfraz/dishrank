import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";
import { siteModeFrom, siteModeHeaders } from "./src/lib/site-mode";

// cacheComponents stays off: public pages use ISR with `export const revalidate = 3600`
// (docs/02 ADR-8, CLAUDE.md rule 8), which Cache Components does not support.
const nextConfig: NextConfig = {
  // `next dev` would print every Server Function call with its arguments (form input such as phone
  // numbers and comments).
  logging: { serverFunctions: false },
  // Server action bodies are small forms (ratings, review decisions); photos go straight to storage.
  experimental: { serverActions: { bodySizeLimit: "128kb" } },
  // The share images read their fonts from src/fonts at request time (src/app/opengraph-image.tsx).
  outputFileTracingIncludes: {
    "/opengraph-image": ["./src/fonts/*.ttf"],
    "/[city]/[slug]/share-image": ["./src/fonts/*.ttf"],
  },
  // Dish photos (public/dish-photos, docs/design/adding-photos.md) through next/image. Vercel Hobby
  // counts each new image transformation, so the set of widths, formats and qualities is small and
  // every result is cached for a year: one WebP per width, quality 70.
  images: {
    formats: ["image/webp"],
    qualities: [70],
    deviceSizes: [400, 828, 1200],
    imageSizes: [64, 128, 280, 560],
    minimumCacheTTL: 31_536_000,
  },
  // Security headers on every response (src/lib/security-headers.ts, docs/11), and in beta
  // (SITE_MODE, docs/10) X-Robots-Tag noindex too. Read at build time: a change needs a redeploy.
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(process.env) },
      ...siteModeHeaders(siteModeFrom(process.env)),
    ];
  },
};

export default nextConfig;
