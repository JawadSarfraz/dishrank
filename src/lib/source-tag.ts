// Source tags (docs/01 D1b, 2026-11-11): a short tag on a landing URL (?s=wa, ?s=ig, ?s=qr, …) says
// which channel a visit came from. The browser keeps the first tag of the visit in a session cookie
// (the pages stay static: nothing on the server reads the query, and canonical URLs never carry it),
// the account saves it once at sign-up, and /admin/analytics counts dish-page visits, new raters
// and ratings per source. A tag is never about who: lowercase letters and digits, twelve at most.

export const SOURCE_TAG = {
  /** The query parameter: /islamabad/best-chicken-karahi?s=wa */
  param: "s",
  /** A session cookie: the visit's source, read by the browser's events and by the sign-up hook. */
  cookie: "dishrank_source",
  pattern: /^[a-z0-9]{1,12}$/,
  /** The tag the site's own Share buttons put on the links they hand out. */
  share: "share",
} as const;

/** The tag as stored, or null: lowercase letters and digits, 1 to 12 of them (case is forgiven). */
export function parseSourceTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().toLowerCase();
  return SOURCE_TAG.pattern.test(tag) ? tag : null;
}

/** The tag in a page's query string (`location.search`), or null. */
export const sourceFromSearch = (search: string) =>
  parseSourceTag(new URLSearchParams(search).get(SOURCE_TAG.param));

/** The tag in a Cookie header or in `document.cookie`, or null. */
export function sourceFromCookies(cookies: string): string | null {
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.split("=");
    if (name?.trim() !== SOURCE_TAG.cookie) continue;
    try {
      return parseSourceTag(decodeURIComponent(rest.join("=")));
    } catch {
      return null;
    }
  }
  return null;
}

/** The first tag of the visit wins: a stored one stays; an arriving one counts only when none is stored. */
export const visitSource = (stored: string | null, arrived: string | null) => stored ?? arrived;

/** The `document.cookie` assignment that keeps the tag for the visit (no expiry: the session). */
export const sourceCookie = (tag: string, secure: boolean) =>
  `${SOURCE_TAG.cookie}=${encodeURIComponent(tag)}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;

/** The account's source at sign-up: an invite link's label, else the visit's tag, else none. */
export const newAccountSource = (inviteLabel: string | null, visitTag: string | null) =>
  inviteLabel ?? visitTag;

/** A link the site hands out (Share) carries the share tag. */
export function withShareTag(url: URL): URL {
  url.searchParams.set(SOURCE_TAG.param, SOURCE_TAG.share);
  return url;
}
