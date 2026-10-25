"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createFromCandidateAction,
  linkCandidateAction,
  reopenCandidateAction,
  skipCandidateAction,
} from "@/server/actions/admin-import";
import type { ImportQueue as Queue, QueueCandidate } from "@/server/services/import.service";
import { describeActionError } from "./action-error";
import { RestaurantCreateFields, type CreateFieldsValues } from "./RestaurantCreateFields";
import { RestaurantPicker } from "./RestaurantPicker";

type Outcome = { kind: "done" | "error"; message: string; restaurantId?: string };

const SKIP_REASONS = [
  ["", "no reason"],
  ["CLOSED", "closed"],
  ["DUPLICATE", "duplicate"],
  ["NOT_A_RESTAURANT", "not a restaurant"],
] as const;

const reasonLabel = (reason: string | null) =>
  SKIP_REASONS.find(([value]) => value === (reason ?? ""))?.[1] ?? "no reason";

const UNREACHABLE = "The request did not reach the server. Check the connection and try again.";
const selectClass = "h-7 rounded-lg border border-input bg-transparent px-1 text-xs";

/** Our restaurant pages open in a new tab, so the list keeps its place and outcomes. */
function RestaurantLink({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <a
      href={`/admin/restaurants/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
    >
      {children}
    </a>
  );
}

export function ImportQueue({ queue }: { queue: Queue }) {
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  if (queue.candidates.length === 0) {
    return <p className="text-sm">Nothing here.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {queue.candidates.map((candidate) => (
        <li key={candidate.id}>
          <CandidateCard
            candidate={candidate}
            queue={queue}
            outcome={outcomes[candidate.id]}
            onOutcome={(outcome) =>
              setOutcomes((prev) => {
                const next = { ...prev };
                if (outcome) next[candidate.id] = outcome;
                else delete next[candidate.id];
                return next;
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}

function CandidateCard({
  candidate: c,
  queue,
  outcome,
  onOutcome,
}: {
  candidate: QueueCandidate;
  queue: Queue;
  outcome: Outcome | undefined;
  onOutcome: (outcome: Outcome | null) => void;
}) {
  const [mode, setMode] = useState<"idle" | "create" | "link">("idle");
  const [reason, setReason] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const done = outcome?.kind === "done";
  const open = c.status === "NEW" && !done;

  function run<T>(
    action: () => Promise<{ data?: T; error?: Parameters<typeof describeActionError>[0] }>,
    onData: (data: T) => void,
    onError: (message: string) => void = (message) => onOutcome({ kind: "error", message }),
  ) {
    startTransition(async () => {
      let res;
      try {
        res = await action();
      } catch {
        onError(UNREACHABLE);
        return;
      }
      if (res.error) onError(describeActionError(res.error));
      else onData(res.data as T);
    });
  }

  function create(values: CreateFieldsValues) {
    run(
      () => createFromCandidateAction({ candidateId: c.id, ...values }),
      (data) => {
        setCreateError(null);
        setMode("idle");
        onOutcome({
          kind: "done",
          restaurantId: data.restaurant.id,
          message: `Created ${data.restaurant.name} (${data.restaurant.slug}) with ${data.dishesAdded} dish${data.dishesAdded === 1 ? "" : "es"}.`,
        });
      },
      setCreateError,
    );
  }

  function link(restaurant: { id: string }) {
    run(
      () => linkCandidateAction({ candidateId: c.id, restaurantId: restaurant.id }),
      (data) => {
        setMode("idle");
        const added = [data.overtureIdSet && "Overture id", data.locationSet && "location"]
          .filter(Boolean)
          .join(" and ");
        onOutcome({
          kind: "done",
          restaurantId: data.restaurant.id,
          message: `Linked to ${data.restaurant.name}${added ? `; it took the ${added}` : ""}.`,
        });
      },
    );
  }

  function skip() {
    run(
      () => skipCandidateAction({ candidateId: c.id, ...(reason ? { reason } : {}) }),
      () => onOutcome({ kind: "done", message: `Skipped (${reasonLabel(reason)}).` }),
    );
  }

  function reopen() {
    run(
      () => reopenCandidateAction({ candidateId: c.id }),
      () => onOutcome({ kind: "done", message: "Back in the list to review." }),
    );
  }

  const location = c.location
    ? `${c.location.lat.toFixed(5)}, ${c.location.lng.toFixed(5)}`
    : "location unknown";

  return (
    <article className={`flex flex-col gap-2 rounded-lg border p-3 ${done ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{c.name}</span>
        <Badge variant="outline">{c.confidence.toFixed(2)}</Badge>
        {c.categories.length > 0 && (
          <span className="text-xs text-muted-foreground">{c.categories.join(" · ")}</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {c.address ?? "(no address)"} · {c.phone ?? "(no phone)"}
        {c.website && (
          <>
            {" · "}
            <a href={c.website} target="_blank" rel="noopener noreferrer" className="underline">
              website
            </a>
          </>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {location}
        {c.location && c.suggestedArea ? ` · area ${c.suggestedArea.name}` : ""}
        {c.location && !c.suggestedArea ? " · no seed area within 1.5 km" : ""}
        {c.missingFromLatest ? " · not in the latest Overture release (closed?)" : ""} · source{" "}
        {c.sources.join(", ")}
      </p>
      {c.dishSlugs.length > 0 && (
        <p className="text-xs">
          Dish hints:{" "}
          {queue.launchDishes
            .filter((d) => c.dishSlugs.includes(d.slug))
            .map((d) => d.name)
            .join(", ")}
        </p>
      )}

      {(c.likelyRestaurants.length > 0 || c.likelyCandidates.length > 0) && (
        <div className="flex flex-col gap-1 rounded-md bg-amber-50 p-2 text-sm dark:bg-amber-950/40">
          <p className="font-medium">Likely duplicate of:</p>
          <ul className="flex flex-col gap-1">
            {c.likelyRestaurants.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <RestaurantLink id={r.id}>{r.name}</RestaurantLink> ({r.areaName ?? "no area"}
                  {r.metres !== null ? `, ${r.metres} m` : ", same name, no distance"}
                  {r.status !== "ACTIVE" ? `, ${r.status}` : ""})
                </span>
                {open && (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => link(r)}>
                    Link
                  </Button>
                )}
              </li>
            ))}
            {c.likelyCandidates.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Overture place &quot;{o.name}&quot; ({o.metres} m,{" "}
                  {o.status === "SKIPPED"
                    ? `skipped: ${reasonLabel(o.skipReason)}`
                    : o.status === "NEW"
                      ? "not reviewed yet"
                      : o.status.toLowerCase()}
                  {o.restaurant && (
                    <>
                      {" as "}
                      <RestaurantLink id={o.restaurant.id}>{o.restaurant.name}</RestaurantLink>
                    </>
                  )}
                  )
                </span>
                {open && o.restaurant && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => link(o.restaurant!)}
                  >
                    Link
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.status !== "NEW" && !outcome && (
        <p className="text-sm">
          {c.status === "SKIPPED"
            ? `Skipped (${reasonLabel(c.skipReason)}).`
            : `${c.status === "CREATED" ? "Created as" : "Linked to"} `}
          {c.restaurant && (
            <RestaurantLink id={c.restaurant.id}>{c.restaurant.name}</RestaurantLink>
          )}
        </p>
      )}

      {outcome && (
        <p
          role="status"
          className={outcome.kind === "error" ? "text-sm text-destructive" : "text-sm font-medium"}
        >
          {outcome.message}{" "}
          {outcome.restaurantId && <RestaurantLink id={outcome.restaurantId}>Open</RestaurantLink>}
        </p>
      )}

      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            aria-expanded={mode === "create"}
            onClick={() => setMode(mode === "create" ? "idle" : "create")}
          >
            Create
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-expanded={mode === "link"}
            onClick={() => setMode(mode === "link" ? "idle" : "link")}
          >
            Link to…
          </Button>
          <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={pending} onClick={skip}>
              Skip
            </Button>
            <label className="sr-only" htmlFor={`reason-${c.id}`}>
              Reason
            </label>
            <select
              id={`reason-${c.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={selectClass}
            >
              {SKIP_REASONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </span>
        </div>
      )}
      {c.status === "SKIPPED" && !done && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          disabled={pending}
          onClick={reopen}
        >
          Reopen
        </Button>
      )}

      {open && mode === "create" && (
        <RestaurantCreateFields
          idPrefix={`create-${c.id}`}
          cities={queue.formCities}
          defaultAreaId={c.suggestedArea?.id ?? queue.area?.id ?? ""}
          prefill={{ name: c.name, address: c.address, phone: c.phone, website: c.website }}
          dishes={queue.launchDishes}
          defaultDishSlugs={c.dishSlugs}
          withLocation={false}
          note={
            c.location
              ? "Prefilled from Overture: fix the name to the signboard spelling, check the address and area, and tick the dishes it serves. The location comes from Overture."
              : "Prefilled from Overture: fix the name to the signboard spelling, check the address and area, and tick the dishes it serves. Overture has no real location for this place: add it later on the restaurant page."
          }
          submitLabel="Confirm and create"
          pending={pending}
          error={createError}
          onSubmit={create}
        />
      )}
      {open && mode === "link" && (
        <RestaurantPicker
          cityId={queue.city.id}
          actionLabel="Link"
          disabled={pending}
          onPick={link}
        />
      )}
    </article>
  );
}
