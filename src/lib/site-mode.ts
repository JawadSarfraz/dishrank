// SITE_MODE (docs/10): "beta" keeps a private beta out of search engines (noindex on every page and
// response, robots.txt disallows everything, a "Beta" label); "live" is the public site. Pure, so
// next.config.ts (build time) and the server agree.

export type SiteMode = "beta" | "live";

/**
 * Only an exact "live" or "beta" counts. Unset or misspelt is beta in production (fail closed: a
 * typo never makes a private beta public) and live in development and tests.
 */
export function siteModeFrom(source: { SITE_MODE?: string; NODE_ENV?: string }): SiteMode {
  if (source.SITE_MODE === "live" || source.SITE_MODE === "beta") return source.SITE_MODE;
  return source.NODE_ENV === "production" ? "beta" : "live";
}

/** Response headers for every path: in beta, search engines may neither index nor follow. */
export function siteModeHeaders(mode: SiteMode) {
  return mode === "beta"
    ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]
    : [];
}
