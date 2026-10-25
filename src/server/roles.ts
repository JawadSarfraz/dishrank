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
