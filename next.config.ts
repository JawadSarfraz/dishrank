import type { NextConfig } from "next";

// cacheComponents stays off: public pages use ISR with `export const revalidate = 3600`
// (docs/02 ADR-8, CLAUDE.md rule 8), which Cache Components does not support.
const nextConfig: NextConfig = {};

export default nextConfig;
