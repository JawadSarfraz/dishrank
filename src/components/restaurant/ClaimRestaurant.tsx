"use client";

// "Is this your restaurant?" (docs/07 §4): a phone number and a note on how we can check it →
// a claim our team verifies by phone. Signed-out visitors are asked to sign in first.
import { useState, useTransition } from "react";
import { describeActionError } from "@/components/admin/action-error";
import { SignInButton } from "@/components/auth/SignInButton";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { claimRestaurantAction } from "@/server/actions/claim";

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
    <Disclosure summary="Is this your restaurant?">
      {state === "sent" ? (
        <p role="status" className="text-sm">
          Thanks. We will call to check it, then you can confirm dishes and prices here. You can
          follow your claim on My ratings.
        </p>
      ) : state === "signin" ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>Sign in to claim this restaurant. You will come back to this page.</p>
          <SignInButton callbackURL={returnPath} />
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
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
              className="field"
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
              className="field py-2"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-fit">
            {pending ? "Sending…" : "Send claim"}
          </Button>
        </form>
      )}
    </Disclosure>
  );
}
