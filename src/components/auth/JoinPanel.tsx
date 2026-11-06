"use client";

// /join/<token>: signed out, keep the invite for the way back and go to Google (the sign-in itself
// grants the panel, in src/server/auth.ts); signed in, join with one tap.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { JOIN_WELCOME_PATH } from "@/lib/panel-invite";
import { joinPanelAction, startPanelInviteAction } from "@/server/actions/panel-invite";

const UNREACHABLE = "The request did not reach the server. Check the connection and try again.";

export function JoinPanel({ token, signedInAs }: { token: string; signedInAs: string | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const { error: signInError } = await authClient.signIn.social({
        provider: "google",
        callbackURL: JOIN_WELCOME_PATH,
        errorCallbackURL: `/sign-in?callbackUrl=${encodeURIComponent(JOIN_WELCOME_PATH)}`,
      });
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

  return (
    <div className="flex flex-col items-start gap-2">
      {signedInAs ? (
        <Button type="button" size="lg" onClick={join} disabled={pending}>
          {pending ? "Joining…" : `Join as ${signedInAs}`}
        </Button>
      ) : (
        <Button type="button" size="lg" onClick={viaGoogle} disabled={pending}>
          {pending ? "Opening Google…" : "Continue with Google"}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
