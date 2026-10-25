import type { NextConfig } from "next";

// cacheComponents stays off: public pages use ISR with `export const revalidate = 3600`
// (docs/02 ADR-8, CLAUDE.md rule 8), which Cache Components does not support.
const nextConfig: NextConfig = {
  experimental: {
    // Google Places responses are never cached (CLAUDE.md rule 2). In `next dev` the HMR fetch
    // cache would keep them anyway, even with cache: "no-store".
    serverComponentsHmrCache: false,
  },
  // `next dev` would print every Server Function call with its arguments, e.g. Google's page token.
  logging: { serverFunctions: false },
};

export default nextConfig;
