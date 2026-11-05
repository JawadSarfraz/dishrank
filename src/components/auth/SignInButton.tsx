"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignInButton({
  callbackURL = "/",
  className,
}: {
  callbackURL?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      // A refused sign-in (e.g. not invited to the beta) comes back to /sign-in with ?error=.
      errorCallbackURL: `/sign-in?callbackUrl=${encodeURIComponent(callbackURL)}`,
    });
    if (error) {
      setError(error.message ?? "Google sign-in is not available right now.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="lg" onClick={signIn} disabled={pending} className={className}>
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
