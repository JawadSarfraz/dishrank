"use client";

// "Is this your restaurant?" (docs/07 §4): a phone number and a note on how we can check it →
// a claim our team verifies by phone. Signed-out visitors are asked to sign in first.
import { useState, useTransition } from "react";
import { describeActionError } from "@/components/admin/action-error";
import { SignInButton } from "@/components/auth/SignInButton";
import { Button } from "@/components/ui/button";
import { claimRestaurantAction } from "@/server/actions/claim";

const field = "min-h-11 rounded-lg border border-input bg-transparent px-3 text-base";

export function ClaimRestaurant({
  restaurantId,
  returnPath,
}: {
  restaurantId: string;
  returnPath: string;
}) {
  const [phone, setPhone] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "signin">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await claimRestaurantAction({ restaurantId, phone, proofNote });
        if (res.error?.code === "UNAUTHENTICATED") setState("signin");
        else if (res.error) setError(describeActionError(res.error));
        else setState("sent");
      } catch {
        setError("The claim did not reach us. Try again.");
      }
    });
  }

  return (
    <details className="rounded-lg border px-3 py-2">
      <summary className="min-h-11 cursor-pointer py-2.5 text-base">
        Is this your restaurant?
      </summary>
      {state === "sent" ? (
        <p role="status" className="pb-2 text-sm">
          Thanks. We will call to check it, then you can confirm dishes and prices here. You can
          follow your claim on My ratings.
        </p>
      ) : state === "signin" ? (
        <div className="flex flex-col gap-2 pb-2 text-sm">
          <p>Sign in to claim this restaurant. You will come back to this page.</p>
          <SignInButton callbackURL={returnPath} />
        </div>
      ) : (
        <form
          className="flex flex-col gap-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Owners confirm their dishes, fix names and prices and see how their dishes rank. They
            cannot rate their own restaurant or see who rated it.
          </p>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Phone number we can call
            <input
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            How can we check it is yours?
            <textarea
              required
              maxLength={500}
              rows={3}
              placeholder="e.g. Call the number on our signboard and ask for the owner"
              value={proofNote}
              onChange={(e) => setProofNote(e.target.value)}
              className="rounded-lg border border-input bg-transparent px-3 py-2 text-base"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="h-11 w-fit px-5">
            Send claim
          </Button>
        </form>
      )}
    </details>
  );
}
