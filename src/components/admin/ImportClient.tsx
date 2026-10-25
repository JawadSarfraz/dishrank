"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  importCreateAction,
  importLinkAction,
  searchPlacesAction,
} from "@/server/actions/admin-import";
import type { ImportSearchPage, ImportSearchResult } from "@/server/services/import.service";
import { describeActionError } from "./action-error";
import { GoogleMapsAttribution } from "./GoogleMapsAttribution";
import { RestaurantCreateFields, type CreateFieldsValues } from "./RestaurantCreateFields";
import { RestaurantPicker } from "./RestaurantPicker";

type Options = {
  cities: {
    id: string;
    slug: string;
    name: string;
    areas: { id: string; slug: string; name: string }[];
  }[];
  dishes: { slug: string; name: string; isLaunch: boolean }[];
};

/** A result as shown here: Google's name and address live in this browser state only. */
type Result = ImportSearchResult & { fetchedAt: string };

type Search = Omit<ImportSearchPage, "results" | "fetchedAt"> & {
  pages: number;
  results: Result[];
};

type Outcome = {
  kind: "created" | "linked" | "unchanged" | "skipped" | "error";
  message: string;
  restaurantId?: string;
};

const STATUS_LABEL: Record<Result["status"], string> = {
  new: "New",
  possible_duplicate: "Possible duplicate",
  imported: "Already imported",
};

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";

const isDone = (outcome: Outcome | undefined) => Boolean(outcome && outcome.kind !== "error");

export function ImportClient({ options }: { options: Options }) {
  const [cityId, setCityId] = useState(options.cities[0]?.id ?? "");
  const city = options.cities.find((c) => c.id === cityId);
  const [areaId, setAreaId] = useState(city?.areas[0]?.id ?? "");
  const [dishSlug, setDishSlug] = useState(options.dishes[0]?.slug ?? "");
  const [search, setSearch] = useState<Search | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [pending, startTransition] = useTransition();

  function chooseCity(id: string) {
    setCityId(id);
    setAreaId(options.cities.find((c) => c.id === id)?.areas[0]?.id ?? "");
  }

  function load(input: { dishSlug: string; areaId: string; pageToken?: string }) {
    startTransition(async () => {
      const res = await searchPlacesAction(input);
      if (res.error) {
        setError(describeActionError(res.error));
        return;
      }
      setError(null);
      const { results, fetchedAt, ...page } = res.data;
      const stamped = results.map((r) => ({ ...r, fetchedAt }));
      setSearch((previous) => {
        if (!input.pageToken || !previous) return { ...page, pages: 1, results: stamped };
        const known = new Set(previous.results.map((r) => r.googlePlaceId));
        return {
          ...page,
          pages: previous.pages + 1,
          results: [...previous.results, ...stamped.filter((r) => !known.has(r.googlePlaceId))],
        };
      });
      if (!input.pageToken) setOutcomes({});
    });
  }

  const launchDishes = options.dishes.filter((d) => d.isLaunch);
  const otherDishes = options.dishes.filter((d) => !d.isLaunch);

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          load({ dishSlug, areaId });
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Dish
          <select
            value={dishSlug}
            onChange={(e) => setDishSlug(e.target.value)}
            className={selectClass}
          >
            <optgroup label="Launch dishes">
              {launchDishes.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Other dishes">
              {otherDishes.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">
            City
            <select
              value={cityId}
              onChange={(e) => chooseCity(e.target.value)}
              className={selectClass}
            >
              {options.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Area
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className={selectClass}
            >
              {city?.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button type="submit" disabled={pending || !areaId || !dishSlug} className="self-start">
          {pending ? "Searching…" : "Search Google Places"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Each search or &quot;Load more&quot; is one billable Google call (20 results, at most 3
          pages per search). Results are shown here only and are never saved.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>

      {search && (
        <section
          className="flex flex-col gap-3 rounded-lg border p-3"
          aria-label="Google Places results"
        >
          <GoogleMapsAttribution />
          <p className="text-sm">
            {search.dish.name} in {search.area.name}, {search.city.name}: {search.results.length}{" "}
            results (page {search.pages} of at most 3). Create a restaurant, link the place to one
            we have, or skip it.
          </p>
          <ul className="flex flex-col gap-3">
            {search.results.map((result) => (
              <li key={result.googlePlaceId}>
                <ResultCard
                  result={result}
                  search={search}
                  areas={options.cities.find((c) => c.id === search.city.id)?.areas ?? []}
                  outcome={outcomes[result.googlePlaceId]}
                  onOutcome={(o) => setOutcomes((prev) => ({ ...prev, [result.googlePlaceId]: o }))}
                />
              </li>
            ))}
            {search.results.length === 0 && <li className="text-sm">No places found.</li>}
          </ul>
          {search.nextPageToken && (
            <Button
              variant="outline"
              disabled={pending}
              className="self-start"
              onClick={() =>
                load({
                  dishSlug: search.dish.slug,
                  areaId: search.area.id,
                  pageToken: search.nextPageToken ?? undefined,
                })
              }
            >
              {pending ? "Loading…" : "Load more"}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

function ResultCard({
  result,
  search,
  areas,
  outcome,
  onOutcome,
}: {
  result: Result;
  search: Search;
  areas: { id: string; name: string }[];
  outcome: Outcome | undefined;
  onOutcome: (outcome: Outcome) => void;
}) {
  const [mode, setMode] = useState<"idle" | "create" | "link">("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const done = isDone(outcome);
  const place = {
    googlePlaceId: result.googlePlaceId,
    lat: result.lat,
    lng: result.lng,
    fetchedAt: result.fetchedAt,
    dishSlug: search.dish.slug,
  };

  function link(target: { id: string }) {
    startTransition(async () => {
      const res = await importLinkAction({ restaurantId: target.id, ...place });
      if (res.error) {
        onOutcome({ kind: "error", message: describeActionError(res.error) });
        return;
      }
      const data = res.data;
      if (data.outcome === "possible_duplicate") {
        onOutcome({ kind: "unchanged", message: data.message, restaurantId: data.restaurant.id });
        return;
      }
      setMode("idle");
      onOutcome({
        kind: "linked",
        restaurantId: data.restaurant.id,
        message:
          `Linked to ${data.restaurant.name}: ` +
          (data.restaurantDish.created
            ? `${search.dish.name} added as a candidate`
            : `${search.dish.name} was already there`) +
          (data.placeLinked ? "; Google place and location saved." : "."),
      });
    });
  }

  function create(values: CreateFieldsValues) {
    startTransition(async () => {
      const res = await importCreateAction({ ...values, cityId: search.city.id, ...place });
      if (res.error) {
        setCreateError(describeActionError(res.error));
        return;
      }
      setCreateError(null);
      setMode("idle");
      onOutcome({
        kind: "created",
        restaurantId: res.data.restaurant.id,
        message: `Created ${res.data.restaurant.name} (${res.data.restaurant.slug}) with ${search.dish.name}.`,
      });
    });
  }

  return (
    <article className={`flex flex-col gap-2 rounded-lg border p-3 ${done ? "opacity-60" : ""}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">{result.displayName || "(no name)"}</h2>
        <Badge variant={result.status === "new" ? "secondary" : "outline"}>
          {STATUS_LABEL[result.status]}
        </Badge>
      </header>
      <p className="text-sm text-muted-foreground">{result.formattedAddress || "(no address)"}</p>
      <a
        href={result.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start text-sm underline"
      >
        Open in Google Maps
      </a>

      {result.existing && (
        <p className="text-sm">
          Already imported as{" "}
          <Link href={`/admin/restaurants/${result.existing.id}`} className="underline">
            {result.existing.name}
          </Link>{" "}
          ({result.existing.areaName ?? "no area"})
          {result.existing.hasDish ? `; it already has ${search.dish.name}.` : "."}
        </p>
      )}

      {result.duplicates.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <p>Possible duplicate of:</p>
          <ul className="flex flex-col gap-1">
            {result.duplicates.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <span>
                  <Link href={`/admin/restaurants/${d.id}`} className="underline">
                    {d.name}
                  </Link>{" "}
                  ({d.areaName ?? "no area"}, similarity {d.similarity})
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending || done}
                  onClick={() => link(d)}
                >
                  Link
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outcome && (
        <p
          role="status"
          className={outcome.kind === "error" ? "text-sm text-destructive" : "text-sm font-medium"}
        >
          {outcome.message}{" "}
          {outcome.restaurantId && outcome.kind !== "error" && (
            <Link href={`/admin/restaurants/${outcome.restaurantId}`} className="underline">
              Open
            </Link>
          )}
        </p>
      )}

      {!done && (
        <div className="flex flex-wrap gap-2">
          {result.existing ? (
            !result.existing.hasDish && (
              <Button size="sm" disabled={pending} onClick={() => link(result.existing!)}>
                Add {search.dish.name} to it
              </Button>
            )
          ) : (
            <>
              <Button
                size="sm"
                aria-expanded={mode === "create"}
                onClick={() => setMode(mode === "create" ? "idle" : "create")}
              >
                {result.status === "possible_duplicate" ? "Create anyway" : "Create"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-expanded={mode === "link"}
                onClick={() => setMode(mode === "link" ? "idle" : "link")}
              >
                Link to…
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOutcome({ kind: "skipped", message: "Skipped." })}
          >
            Skip
          </Button>
        </div>
      )}

      {!done && mode === "create" && (
        <RestaurantCreateFields
          idPrefix={`create-${result.googlePlaceId}`}
          areas={areas}
          defaultAreaId={search.area.id}
          pending={pending}
          error={createError}
          onSubmit={create}
        />
      )}
      {!done && mode === "link" && (
        <RestaurantPicker
          cityId={search.city.id}
          actionLabel="Link"
          disabled={pending}
          onPick={link}
        />
      )}
    </article>
  );
}
