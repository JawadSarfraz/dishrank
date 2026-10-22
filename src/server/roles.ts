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

/** Only relative paths on this site are allowed after sign-in (no open redirects). */
export function safeCallbackPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/";
  }
  return value;
}
