"use client";

// "Delete my account" with a confirmation step: the user types DELETE. Afterwards the browser goes
// to the home page with a full reload, so nothing of the old session stays in memory.
import { useState, useTransition } from "react";
import { describeActionError } from "@/components/admin/action-error";
import { Button } from "@/components/ui/button";
import { deleteAccountAction } from "@/server/actions/account";

export function DeleteAccount({ isAdmin }: { isAdmin: boolean }) {
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await deleteAccountAction({ confirm });
        if (res.error) setError(describeActionError(res.error));
        else window.location.replace(window.location.origin);
      } catch {
        setError("The request did not reach us. Try again.");
      }
    });
  }

  return (
    <details className="rounded-lg border px-3 py-2">
      <summary className="min-h-11 cursor-pointer py-2.5 text-base">Delete my account</summary>
      {isAdmin ? (
        <p className="pb-2 text-sm">
          An admin account cannot delete itself. Ask another admin, or remove the admin role first.
        </p>
      ) : (
        <form
          className="flex flex-col gap-3 pb-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            remove();
          }}
        >
          <p>This deletes, for good:</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>your account and sign-in;</li>
            <li>all your ratings, comments and photos (the rankings are updated);</li>
            <li>
              your restaurant claims and the reports and suggestions we have not looked at yet.
            </li>
          </ul>
          <p>
            Menu photos you sent stay with their restaurant, without your name. A restaurant you
            manage is no longer yours.
          </p>
          <label className="flex flex-col gap-1 font-medium">
            Type DELETE to confirm
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              className="min-h-11 rounded-lg border border-input bg-transparent px-3 text-base"
            />
          </label>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="destructive"
            disabled={pending || confirm !== "DELETE"}
            className="h-11 w-fit px-5"
          >
            {pending ? "Deleting…" : "Delete my account"}
          </Button>
        </form>
      )}
    </details>
  );
}
