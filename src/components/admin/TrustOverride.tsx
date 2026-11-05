"use client";

// Sets a user's trust by hand (0.3 to 1.5) or clears it; the nightly job keeps a hand-set value.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setTrustOverrideAction } from "@/server/actions/admin-users";
import { describeActionError } from "./action-error";

export function TrustOverride({
  userId,
  trustOverride,
  name,
}: {
  userId: string;
  trustOverride: number | null;
  name: string;
}) {
  const [value, setValue] = useState(trustOverride?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: number | null) {
    startTransition(async () => {
      try {
        const res = await setTrustOverrideAction(userId, { trustOverride: next });
        setError(res.error ? describeActionError(res.error) : null);
        if (!res.error && next === null) setValue("");
      } catch {
        setError("The request did not reach the server. Try again.");
      }
    });
  }

  return (
    <form
      className="flex flex-wrap items-center justify-end gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value);
        if (value.trim() === "" || !Number.isFinite(n)) setError("Enter a trust from 0.3 to 1.5");
        else save(n);
      }}
    >
      <label className="sr-only" htmlFor={`trust-${userId}`}>
        Trust for {name}
      </label>
      <input
        id={`trust-${userId}`}
        type="number"
        inputMode="decimal"
        min={0.3}
        max={1.5}
        step={0.1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="trust"
        className="field h-10 w-24 text-sm"
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending}
        aria-label={`Set trust for ${name}`}
      >
        {pending ? "Saving…" : "Set trust"}
      </Button>
      {trustOverride !== null && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          aria-label={`Clear the hand-set trust of ${name}`}
          onClick={() => save(null)}
        >
          Clear
        </Button>
      )}
      {error && (
        <span role="alert" className="w-full text-right text-xs text-destructive">
          {error}
        </span>
      )}
    </form>
  );
}
