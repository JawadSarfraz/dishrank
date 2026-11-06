/**
 * Where Google sends someone back after signing in through a panel invite link (docs/07 §7a). Fixed,
 * so the token never enters the OAuth state, which Better Auth stores in clear; the sign-in hooks
 * honour the invite cookie only on a sign-in that names this path.
 */
export const JOIN_WELCOME_PATH = "/join/welcome";
