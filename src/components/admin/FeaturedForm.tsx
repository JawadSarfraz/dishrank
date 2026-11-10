"use client";

// /admin/rankings "Featured dishes": per city, the one or two launch dishes the home page leads with,
// the round's name and the day voting for its results closes (end of day, Pakistan). Saving replaces
// the city's set; an empty first choice clears it.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setFeaturedAction } from "@/server/actions/admin-rankings";
import { describeActionError } from "./action-error";

const selectClass = "field field-select h-11 w-auto min-w-0";

export function FeaturedForm({
  city,
  dishes,
  current,
}: {
  city: { slug: string; name: string };
  dishes: { slug: string; name: string }[];
  current: { dishSlugs: string[]; roundName: string | null; closesOn: string | null };
}) {
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const dishSlugs = [value("first"), value("second")].filter(Boolean);
    startTransition(async () => {
      try {
        const res = await setFeaturedAction({
          city: city.slug,
          dishSlugs: [...new Set(dishSlugs)],
          roundName: value("roundName") || undefined,
          closesOn: value("closesOn") || undefined,
        });
        setStatus(
          res.error
            ? { text: describeActionError(res.error), error: true }
            : { text: "Saved. The home page shows it at its next visit.", error: false },
        );
      } catch {
        setStatus({ text: "The request did not reach the server. Try again.", error: true });
      }
    });
  }

  const options = (name: string, chosen: string | undefined, label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select name={name} defaultValue={chosen ?? ""} className={selectClass}>
        <option value="">None</option>
        {dishes.map((d) => (
          <option key={d.slug} value={d.slug}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="font-medium">{city.name}</p>
      <div className="flex flex-wrap items-end gap-3">
        {options("first", current.dishSlugs[0], "First dish")}
        {options("second", current.dishSlugs[1], "Second dish (optional)")}
        <label className="flex flex-col gap-1 text-sm">
          Round name
          <Input
            name="roundName"
            defaultValue={current.roundName ?? ""}
            placeholder="winter results"
            maxLength={40}
            className="w-44"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Voting closes on (Pakistan, end of day)
          <Input
            name="closesOn"
            type="date"
            defaultValue={current.closesOn ?? ""}
            className="w-44"
          />
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {status && (
        <p
          role={status.error ? "alert" : "status"}
          className={status.error ? "text-destructive" : ""}
        >
          {status.text}
        </p>
      )}
    </form>
  );
}
