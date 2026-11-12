"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startGoogleSignIn } from "@/lib/google-sign-in";
import { useInAppBrowser } from "@/lib/use-in-app-browser";
import { OpenInBrowser } from "./OpenInBrowser";

export function SignInButton({
  callbackURL = "/",
  className,
}: {
  callbackURL?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inApp = useInAppBrowser();

  async function signIn() {
    setPending(true);
    setError(null);
    const { error } = await startGoogleSignIn(callbackURL);
    if (error) {
      setError(error.message ?? "Google sign-in is not available right now.");
      setPending(false);
    }
  }

  if (inApp) return <OpenInBrowser browser={inApp} />;

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="lg" onClick={signIn} disabled={pending} className={className}>
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
