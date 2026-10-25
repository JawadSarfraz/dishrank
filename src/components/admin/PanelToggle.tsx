"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setPanelAction } from "@/server/actions/admin-users";
import { describeActionError } from "./action-error";

/** Turns a user's panel flag on or off; the server sets trust and recomputes their rows. */
export function PanelToggle({
  userId,
  isPanel,
  name,
}: {
  userId: string;
  isPanel: boolean;
  name: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={isPanel ? "outline" : "secondary"}
        disabled={pending}
        aria-label={`${isPanel ? "Remove" : "Add"} ${name} ${isPanel ? "from" : "to"} the panel`}
        onClick={() =>
          startTransition(async () => {
            const res = await setPanelAction(userId, { isPanel: !isPanel });
            setError(res.error ? describeActionError(res.error) : null);
          })
        }
      >
        {pending ? "Saving…" : isPanel ? "Panel off" : "Panel on"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
