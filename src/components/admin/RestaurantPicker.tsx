"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchRestaurantsAdminAction } from "@/server/actions/admin-restaurants";
import { describeActionError } from "./action-error";

export type PickedRestaurant = {
  id: string;
  slug: string;
  name: string;
  areaName: string | null;
  status: string;
};

/** Search the city's restaurants (any status except merged) and pick one. */
export function RestaurantPicker({
  cityId,
  excludeId,
  actionLabel,
  onPick,
  disabled,
}: {
  cityId: string;
  excludeId?: string;
  actionLabel: string;
  onPick: (restaurant: PickedRestaurant) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedRestaurant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = useId();

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      let res;
      try {
        res = await searchRestaurantsAdminAction({ cityId, q, excludeId });
      } catch {
        setError("The search did not reach the server. Try again.");
        return;
      }
      if (res.error) {
        setError(describeActionError(res.error));
        setResults(null);
        return;
      }
      setError(null);
      setResults(res.data);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={search} className="flex gap-2" role="search">
        <label className="sr-only" htmlFor={inputId}>
          Restaurant name
        </label>
        <Input
          id={inputId}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name"
          maxLength={80}
        />
        <Button type="submit" variant="outline" disabled={pending || !q.trim()}>
          Search
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {results && results.length === 0 && <p className="text-sm">No restaurant found.</p>}
      {results && results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {r.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {r.areaName ?? "no area"}
                  {r.status !== "ACTIVE" ? ` · ${r.status}` : ""}
                </span>
              </span>
              <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onPick(r)}>
                {actionLabel}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
