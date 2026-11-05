"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { describeActionError } from "@/components/admin/action-error";
import { deleteRatingAction } from "@/server/actions/rating";

/** Deletes one of my ratings after a confirm; the list refreshes from the server. */
export function DeleteRatingButton({ ratingId, label }: { ratingId: string; label: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-destructive underline-offset-4 hover:underline disabled:opacity-50"
        onClick={() => {
          if (!window.confirm(`Delete your rating of ${label}?`)) return;
          startTransition(async () => {
            try {
              const res = await deleteRatingAction(ratingId);
              if (res.error) setError(describeActionError(res.error));
              else router.refresh();
            } catch {
              setError("The request did not reach the server. Try again.");
            }
          });
        }}
      >
        <Trash2Icon aria-hidden="true" className="size-4" />
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </>
  );
}
