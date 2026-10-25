import type { NextConfig } from "next";

// cacheComponents stays off: public pages use ISR with `export const revalidate = 3600`
// (docs/02 ADR-8, CLAUDE.md rule 8), which Cache Components does not support.
const nextConfig: NextConfig = {
  // `next dev` would print every Server Function call with its arguments (form input such as phone
  // numbers and comments).
  logging: { serverFunctions: false },
};

export default nextConfig;
