// Security headers on every response (docs/11 Security, Phase 6). Pure, so next.config.ts (build
// time) and a unit test agree. The CSP is basic: public pages are static (ISR), so Next.js' inline
// scripts cannot carry a per-request nonce and 'unsafe-inline' stays for scripts and styles. The
// browser talks only to this site and to the Supabase Storage S3 endpoint (signed PUT uploads, and
// signed GET links for admins); Google sign-in is a top-level redirect.

export function securityHeaders(source: {
  NODE_ENV?: string;
  SUPABASE_S3_ENDPOINT?: string;
}): { key: string; value: string }[] {
  const production = source.NODE_ENV === "production";
  let storage = "";
  try {
    storage = source.SUPABASE_S3_ENDPOINT ? new URL(source.SUPABASE_S3_ENDPOINT).origin : "";
  } catch {
    storage = "";
  }
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // React's development build evaluates code; production never does.
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: blob:${storage ? ` ${storage}` : ""}`,
    `connect-src 'self'${storage ? ` ${storage}` : ""}`,
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Location: "Near me" and a panel member's on-site location, on this site only.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
    },
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000" }] : []),
  ];
}
