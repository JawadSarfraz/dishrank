/**
 * Where Google sends someone back after signing in through a panel invite link (docs/07 §7a). Fixed,
 * so the token never enters the OAuth state, which Better Auth stores in clear; the sign-in hooks
 * honour the invite cookie only on a sign-in that names this path.
 */
export const JOIN_WELCOME_PATH = "/join/welcome";

/** The return address, carrying a checked `next` path (safeNextPath). */
export const joinWelcomeUrl = (next: string | null) =>
  next ? `${JOIN_WELCOME_PATH}?next=${encodeURIComponent(next)}` : JOIN_WELCOME_PATH;

export const isJoinWelcomeUrl = (url: unknown) =>
  typeof url === "string" && url.split("?")[0] === JOIN_WELCOME_PATH;

/** An invite link's path, opening `next` after joining: "/join/<token>?next=%2Fislamabad%2F…". */
export const panelInvitePath = (token: string, next: string | null) =>
  next ? `/join/${token}?next=${encodeURIComponent(next)}` : `/join/${token}`;
