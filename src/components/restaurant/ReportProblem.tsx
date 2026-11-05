"use client";

// "Report a problem" on a restaurant page: closed, wrong location, wrong dish or other → a review
// item for the admins. Signed-out diners are asked to sign in first (reports need an account).
import { useState, useTransition } from "react";
import { describeActionError } from "@/components/admin/action-error";
import { SignInButton } from "@/components/auth/SignInButton";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { reportProblemAction } from "@/server/actions/report";

const REASONS = [
  { value: "CLOSED", label: "It has closed" },
  { value: "WRONG_LOCATION", label: "The map location is wrong" },
  { value: "WRONG_DISH", label: "A dish here is wrong or not served" },
  { value: "OTHER", label: "Something else" },
] as const;

export function ReportProblem({
  restaurantId,
  dishes,
  returnPath,
}: {
  restaurantId: string;
  dishes: { id: string; name: string }[];
  returnPath: string;
}) {
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("CLOSED");
  const [dishId, setDishId] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "signin">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await reportProblemAction({
          restaurantId,
          reason,
          dishId: reason === "WRONG_DISH" && dishId ? dishId : undefined,
          note: note.trim() || undefined,
        });
        if (res.error?.code === "UNAUTHENTICATED") setState("signin");
        else if (res.error) setError(describeActionError(res.error));
        else setState("sent");
      } catch {
        setError("The report did not reach us. Try again.");
      }
    });
  }

  return (
    <Disclosure summary="Report a problem">
      {state === "sent" ? (
        <p role="status" className="text-sm">
          Thanks. We will check it.
        </p>
      ) : state === "signin" ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>Sign in to send a report. You will come back to this page.</p>
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
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">What is wrong?</legend>
            {REASONS.map((r) => (
              <label key={r.value} className="flex min-h-11 items-center gap-3 text-base">
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="size-5 accent-brand"
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          {reason === "WRONG_DISH" && dishes.length > 0 && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Which dish?
              <select
                value={dishId}
                onChange={(e) => setDishId(e.target.value)}
                className="field field-select"
              >
                <option value="">Choose a dish</option>
                {dishes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm font-medium">
            Details (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={280}
              rows={3}
              className="field py-2"
            />
          </label>
          <Button type="submit" disabled={pending} className="w-fit">
            {pending ? "Sending…" : "Send report"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </Disclosure>
  );
}
