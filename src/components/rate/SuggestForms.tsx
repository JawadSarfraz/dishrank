"use client";

// "Can't find it?" and "Dish not listed?" (docs/05, docs/07 §6): free text goes only into the review
// queue, never into the restaurant or dish lists, and nothing is public until an admin approves it.
import { useState, useTransition } from "react";
import { SignInButton } from "@/components/auth/SignInButton";
import { describeActionError } from "@/components/admin/action-error";
import { Button } from "@/components/ui/button";
import { proposeAction } from "@/server/actions/rating";

const field = "h-11 rounded-lg border border-input bg-transparent px-3 text-base";

function useProposal() {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  function send(input: Record<string, unknown>, thanks: string) {
    startTransition(async () => {
      let res;
      try {
        res = await proposeAction(input);
      } catch {
        setMessage({ text: "The suggestion did not reach the server. Try again.", error: true });
        return;
      }
      setMessage(
        res.error
          ? { text: describeActionError(res.error), error: true }
          : { text: thanks, error: false },
      );
    });
  }
  return { message, pending, send };
}

function Feedback({ message }: { message: { text: string; error: boolean } | null }) {
  if (!message) return null;
  return (
    <p
      role={message.error ? "alert" : "status"}
      className={message.error ? "text-sm text-destructive" : "text-sm"}
    >
      {message.text}
    </p>
  );
}

export function SuggestRestaurant({
  city,
  signedIn,
  defaultName,
}: {
  city: { id: string; slug: string; name: string; areas: { id: string; name: string }[] };
  signedIn: boolean;
  defaultName: string;
}) {
  const { message, pending, send } = useProposal();
  return (
    <details className="rounded-lg border px-3 py-2">
      <summary className="min-h-11 cursor-pointer py-2 text-base">
        Can&apos;t find it? Suggest a restaurant
      </summary>
      {signedIn ? (
        <form
          key={city.id}
          className="flex flex-col gap-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            send(
              {
                type: "RESTAURANT",
                name: String(form.get("name") ?? ""),
                cityId: city.id,
                areaId: String(form.get("areaId") ?? ""),
                note: String(form.get("note") ?? ""),
              },
              "Thanks! We will check it and add it. It is not public until then.",
            );
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            Name
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={defaultName}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Area in {city.name}
            <select name="areaId" required defaultValue="" className={field}>
              <option value="" disabled>
                Choose an area
              </option>
              {city.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Note (optional)
            <input
              name="note"
              maxLength={280}
              placeholder="e.g. next to the petrol pump"
              className={field}
            />
          </label>
          <Button type="submit" disabled={pending} className="h-11 self-start">
            {pending ? "Sending…" : "Suggest restaurant"}
          </Button>
          <Feedback message={message} />
        </form>
      ) : (
        <div className="flex flex-col gap-2 pb-2">
          <p className="text-sm">Sign in to suggest a restaurant.</p>
          <SignInButton callbackURL={`/rate?city=${city.slug}`} />
        </div>
      )}
    </details>
  );
}

export function ProposeDish({
  restaurantId,
  signedIn,
  callbackUrl,
  defaultName,
}: {
  restaurantId: string;
  signedIn: boolean;
  callbackUrl: string;
  defaultName: string;
}) {
  const { message, pending, send } = useProposal();
  return (
    <details className="rounded-lg border px-3 py-2">
      <summary className="min-h-11 cursor-pointer py-2 text-base">
        Dish not listed? Propose it
      </summary>
      {signedIn ? (
        <form
          className="flex flex-col gap-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            send(
              {
                type: "DISH",
                name: String(form.get("name") ?? ""),
                restaurantId,
                note: String(form.get("note") ?? ""),
              },
              "Thanks! We will review the dish. You can rate it once it is added.",
            );
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            Dish name
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={defaultName}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Note (optional)
            <input name="note" maxLength={280} className={field} />
          </label>
          <Button type="submit" disabled={pending} className="h-11 self-start">
            {pending ? "Sending…" : "Propose dish"}
          </Button>
          <Feedback message={message} />
        </form>
      ) : (
        <div className="flex flex-col gap-2 pb-2">
          <p className="text-sm">Sign in to propose a dish.</p>
          <SignInButton callbackURL={callbackUrl} />
        </div>
      )}
    </details>
  );
}
