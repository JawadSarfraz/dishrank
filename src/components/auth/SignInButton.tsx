"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignInButton({ callbackURL = "/" }: { callbackURL?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL });
    if (error) {
      setError(error.message ?? "Google sign-in is not available right now.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={signIn} disabled={pending} className="h-11 w-fit px-5">
        Sign in with Google
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
