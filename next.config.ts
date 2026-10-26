import type { NextConfig } from "next";
import { siteModeFrom, siteModeHeaders } from "./src/lib/site-mode";

// cacheComponents stays off: public pages use ISR with `export const revalidate = 3600`
// (docs/02 ADR-8, CLAUDE.md rule 8), which Cache Components does not support.
const nextConfig: NextConfig = {
  // `next dev` would print every Server Function call with its arguments (form input such as phone
  // numbers and comments).
  logging: { serverFunctions: false },
  // Beta (SITE_MODE, docs/10): X-Robots-Tag noindex on every response, pages and files alike.
  // Read at build time, like the pages: changing SITE_MODE needs a redeploy.
  async headers() {
    return siteModeHeaders(siteModeFrom(process.env));
  },
};

export default nextConfig;
