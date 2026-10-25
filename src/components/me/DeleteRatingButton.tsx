"use client";

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
        className="min-h-11 py-2 text-destructive underline"
        onClick={() => {
          if (!window.confirm(`Delete your rating of ${label}?`)) return;
          startTransition(async () => {
            const res = await deleteRatingAction(ratingId);
            if (res.error) setError(describeActionError(res.error));
            else router.refresh();
          });
        }}
      >
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
