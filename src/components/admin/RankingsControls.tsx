"use client";

// /admin/rankings buttons: "Recompute now" (waits for the run) and "Launch city" (asks first,
// because launchedAt is set only once).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { launchCityAction, recomputeNowAction } from "@/server/actions/admin-rankings";
import { describeActionError } from "./action-error";

export function RecomputeButton() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const res = await recomputeNowAction();
              if (res.error) setStatus(describeActionError(res.error));
              else {
                const s = res.data.summary;
                setStatus(
                  `${res.data.ok ? "Done" : "Finished with failures"}: ${s.rows.recomputed} rows, ` +
                    `${s.stale} stale, ${s.trust.changed} trust changes, ${s.durationMs} ms.`,
                );
                router.refresh();
              }
            } catch {
              setStatus("The request did not reach the server. Try again.");
            }
          })
        }
      >
        {pending ? "Recomputing…" : "Recompute now"}
      </Button>
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </div>
  );
}

export function LaunchCityButton({ city, name }: { city: string; name: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Launch ${name} today? The launch date is set once.`)) return;
          startTransition(async () => {
            try {
              const res = await launchCityAction({ city });
              setError(res.error ? describeActionError(res.error) : null);
            } catch {
              setError("The request did not reach the server. Try again.");
            }
          });
        }}
      >
        {pending ? "Launching…" : `Launch ${name}`}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
