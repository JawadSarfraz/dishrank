// Starts Google sign-in, for SignInButton and the panel invite page. A page reached from an in-app
// browser (OpenInBrowser) was counted there, so its sign-in is marked instead of counted again;
// the mark rides the OAuth state to the sign-in's end (src/server/auth.ts).
import { authClient } from "./auth-client";
import { cameFromInAppBrowser } from "./in-app-browser";
import { trackEvent } from "./track";

export function startGoogleSignIn(callbackURL: string) {
  const escaped = cameFromInAppBrowser(window.location.search);
  if (!escaped) trackEvent({ name: "sign_in_started" });
  return authClient.signIn.social({
    provider: "google",
    callbackURL,
    // A refused sign-in (e.g. not invited to the beta) comes back to /sign-in with ?error=.
    errorCallbackURL: `/sign-in?callbackUrl=${encodeURIComponent(callbackURL)}`,
    ...(escaped ? { additionalData: { via: "in-app" } } : {}),
  });
}
