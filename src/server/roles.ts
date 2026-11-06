import { AppError } from "./errors";

export const ROLES = ["USER", "OWNER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

/** The signed-in user as the server sees it. `role` always comes from the database, never from the client. */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export function toRole(value: unknown): Role {
  return ROLES.includes(value as Role) ? (value as Role) : "USER";
}

export function hasRole(user: SessionUser, allowed: Role | readonly Role[]): boolean {
  const list: readonly Role[] = typeof allowed === "string" ? [allowed] : allowed;
  return list.includes(user.role);
}

/**
 * Session-free role check for services: admin/owner services take the current user as their
 * first argument and call this before touching data (CLAUDE.md rule 6).
 */
export function assertRole(
  actor: SessionUser | null | undefined,
  allowed: Role | readonly Role[],
): SessionUser {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Sign in required", 401);
  if (!hasRole(actor, allowed))
    throw new AppError("FORBIDDEN", "You do not have access to this", 403);
  return actor;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
const ENCODED_PATH_SEPARATOR = /%2[fF]|%5[cC]/;
const PARSER_ORIGIN = "https://dishrank.invalid";

/**
 * Only root-relative paths on this site are allowed after sign-in (no open redirects). The same
 * rules as Better Auth's own callback check, so a value we accept is never refused at sign-in:
 * no "//", no backslash, no control character, no encoded "/" or "\\" in the path, same origin.
 */
export function safeCallbackPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return "/";
  }
  const pathEnd = value.search(/[?#]/);
  if (ENCODED_PATH_SEPARATOR.test(pathEnd === -1 ? value : value.slice(0, pathEnd))) return "/";
  try {
    return new URL(value, PARSER_ORIGIN).origin === PARSER_ORIGIN ? value : "/";
  } catch {
    return "/";
  }
}

/** Pages an invite link's `next` must not open: they would loop, or are no page at all. */
const NOT_A_NEXT = /^\/(?:join|sign-in|api)(?:[/?#]|$)/;

/**
 * Where a panel invite link goes after joining (docs/07 §7a): a path on this site, or null. The same
 * rules as a sign-in's callback, so a link can never send a friend to another site.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  const path = signedInRedirectPath(value);
  return path === "/" || NOT_A_NEXT.test(path) ? null : path;
}

/**
 * Where /sign-in sends a visitor who is signed in already: the callbackUrl when it is a path on
 * this site (safeCallbackPath), home otherwise, and never /sign-in itself (one hop, no loop). The
 * path goes through the URL parser as a browser would read it: non-ASCII is percent-encoded (a
 * Location header takes Latin-1 only) and dot segments are resolved, then it is checked again
 * ("/.//x" resolves to "//x", which is refused).
 */
export function signedInRedirectPath(value: unknown): string {
  const url = new URL(safeCallbackPath(value), PARSER_ORIGIN);
  if (url.pathname === "/sign-in" || url.pathname === "/sign-in/") return "/";
  return safeCallbackPath(`${url.pathname}${url.search}${url.hash}`);
}
