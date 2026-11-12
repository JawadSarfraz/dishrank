"use client";

// /join/<token>: signed out, keep the invite for the way back and go to Google (the sign-in itself
// grants the panel, in src/server/auth.ts); signed in, join with one tap.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startGoogleSignIn } from "@/lib/google-sign-in";
import { joinWelcomeUrl } from "@/lib/panel-invite";
import { useInAppBrowser } from "@/lib/use-in-app-browser";
import { joinPanelAction, startPanelInviteAction } from "@/server/actions/panel-invite";
import { OpenInBrowser } from "./OpenInBrowser";

const UNREACHABLE = "The request did not reach the server. Check the connection and try again.";

export function JoinPanel({
  token,
  signedInAs,
  next,
}: {
  token: string;
  signedInAs: string | null;
  /** Already checked by the page (safeNextPath): opened after joining. */
  next: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inApp = useInAppBrowser();

  async function viaGoogle() {
    setPending(true);
    setError(null);
    try {
      const started = await startPanelInviteAction(token);
      if (started.error) {
        setError(started.error.message);
        setPending(false);
        return;
      }
      // The invite goes in the cookie alone: this path is what Better Auth stores for the way back.
      const { error: signInError } = await startGoogleSignIn(joinWelcomeUrl(next));
      if (signInError) {
        setError(signInError.message ?? "Google sign-in is not available right now.");
        setPending(false);
      }
    } catch {
      setError(UNREACHABLE);
      setPending(false);
    }
  }

  async function join() {
    setPending(true);
    setError(null);
    try {
      // On success the action refreshes this page, which then says "You're on the panel".
      const res = await joinPanelAction(token);
      if (res.error) setError(res.error.message);
    } catch {
      setError(UNREACHABLE);
    }
    setPending(false);
  }

  // Joining while signed in needs no Google, so it works in any browser.
  if (inApp && !signedInAs) return <OpenInBrowser browser={inApp} />;

  return (
    <div className="flex flex-col gap-2">
      {signedInAs ? (
        <Button
          type="button"
          variant="cta"
          size="xl"
          onClick={join}
          disabled={pending}
          className="h-auto min-h-14 w-full py-2 text-center whitespace-normal"
        >
          {pending ? "Joining…" : `Join as ${signedInAs}`}
        </Button>
      ) : (
        <Button
          type="button"
          variant="cta"
          size="xl"
          onClick={viaGoogle}
          disabled={pending}
          className="h-auto min-h-14 w-full py-2 text-center whitespace-normal"
        >
          {pending ? "Opening Google…" : "Continue with Google"}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
