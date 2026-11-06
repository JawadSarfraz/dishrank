"use client";

// /admin/rankings buttons: "Recompute now" (waits for the run) and "End early rankings in 60 days"
// (shows what it would do first, because launchedAt is set only once).
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

const places = (n: number) => `${n} place${n === 1 ? "" : "s"}`;

export function EndEarlyRankingsButton({
  city,
  name,
  days,
  endsOn,
  rankedNow,
  stillRanked,
  normalRule,
}: {
  city: string;
  name: string;
  days: number;
  /** The day they would end if this is pressed today. */
  endsOn: string;
  rankedNow: number;
  stillRanked: number;
  /** "8 raters and weight 5.0". */
  normalRule: string;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!asking) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setAsking(true)}>
        End early rankings in {days} days
      </Button>
    );
  }
  const losing = rankedNow - stillRanked;
  return (
    <div
      role="group"
      aria-label={`End early rankings in ${name}?`}
      className="flex w-full flex-col gap-2 rounded-lg border bg-muted/40 p-3"
    >
      <p className="font-medium">
        End early rankings in {name} on {endsOn}?
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>
          {rankedNow === 1 ? "1 place ranks" : `${places(rankedNow)} rank`} now. A restaurant ranked
          for two dishes counts twice.
        </li>
        <li>
          {stillRanked === 1 ? "1 place" : places(stillRanked)} would still rank under the normal
          rules ({normalRule}).
        </li>
        {losing > 0 && (
          <li>
            As things stand, {places(losing)} would lose {losing === 1 ? "its" : "their"} rank that
            night, and a dish page left without a rank drops out of search.
          </li>
        )}
        <li>It is set once: it cannot be moved or undone here.</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const res = await launchCityAction({ city });
                setError(res.error ? describeActionError(res.error) : null);
              } catch {
                setError("The request did not reach the server. Try again.");
              }
            })
          }
        >
          {pending ? "Saving…" : `Yes, end them on ${endsOn}`}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setAsking(false)}
        >
          Not now
        </Button>
      </div>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
