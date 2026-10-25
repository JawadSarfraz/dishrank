"use client";

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

type City = {
  id: string;
  slug: string;
  name: string;
  areas: { id: string; slug: string; name: string }[];
};
type Options = { cities: City[]; dishes: { slug: string; name: string; isLaunch: boolean }[] };

/** A result as shown here: Google's name and address live in this browser state only. */
type Result = ImportSearchResult & { fetchedAt: string };

type Search = Omit<ImportSearchPage, "results" | "fetchedAt"> & {
  /** Increases with every new search, so result cards never keep an earlier search's state. */
  id: number;
  pages: number;
  results: Result[];
};

type Outcome = {
  kind: "created" | "linked" | "refused" | "skipped" | "error";
  message: string;
  restaurantId?: string;
};

const STATUS_LABEL: Record<Result["status"], string> = {
  new: "New",
  possible_duplicate: "Possible duplicate",
  imported: "Already imported",
  no_location: "No location",
};

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";
const UNREACHABLE = "The request did not reach the server. Check the connection and try again.";

/** Created, linked and skipped results are finished; a refused link or an error leaves every action open. */
const isDone = (outcome: Outcome | undefined) =>
  outcome?.kind === "created" || outcome?.kind === "linked" || outcome?.kind === "skipped";

/** Our restaurant pages open in a new tab, so the search results (billable to fetch again) stay. */
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

export function ImportClient({ options }: { options: Options }) {
  const [cityId, setCityId] = useState(options.cities[0]?.id ?? "");
  const city = options.cities.find((c) => c.id === cityId);
  const [areaId, setAreaId] = useState(city?.areas[0]?.id ?? "");
  const [dishSlug, setDishSlug] = useState(options.dishes[0]?.slug ?? "");
  const [search, setSearch] = useState<Search | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [pending, startTransition] = useTransition();

  function chooseCity(id: string) {
    setCityId(id);
    setAreaId(options.cities.find((c) => c.id === id)?.areas[0]?.id ?? "");
  }

  function load(input: { dishSlug: string; areaId: string; pageToken?: string }) {
    const show = input.pageToken ? setPageError : setError;
    startTransition(async () => {
      let res;
      try {
        res = await searchPlacesAction(input);
      } catch {
        show(UNREACHABLE);
        return;
      }
      if (res.error) {
        show(describeActionError(res.error));
        return;
      }
      setError(null);
      setPageError(null);
      const { results, fetchedAt, ...page } = res.data;
      const stamped = results.map((r) => ({ ...r, fetchedAt }));
      setSearch((previous) => {
        if (!input.pageToken || !previous) {
          return { ...page, id: (previous?.id ?? 0) + 1, pages: 1, results: stamped };
        }
        const known = new Set(previous.results.map((r) => r.googlePlaceId));
        return {
          ...page,
          id: previous.id,
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
          pages per search, 150 calls a day for all admins). Results are shown here only and are
          never saved.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>

      {search && (
        <section className="flex flex-col gap-3" aria-label="Search results">
          <p className="text-sm">
            {search.dish.name} near {search.area.name}, {search.city.name}: {search.results.length}{" "}
            results (page {search.pages} of at most 3). Create a restaurant, link the place to one
            we have, or skip it.
          </p>
          <ul className="flex flex-col gap-3">
            {search.results.map((result) => (
              <li key={`${search.id}:${result.googlePlaceId}`}>
                <ResultCard
                  result={result}
                  search={search}
                  cities={options.cities}
                  outcome={outcomes[result.googlePlaceId]}
                  onOutcome={(o) =>
                    setOutcomes((prev) => {
                      const next = { ...prev };
                      if (o) next[result.googlePlaceId] = o;
                      else delete next[result.googlePlaceId];
                      return next;
                    })
                  }
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
          {pageError && (
            <p role="alert" className="text-sm text-destructive">
              {pageError}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function ResultCard({
  result,
  search,
  cities,
  outcome,
  onOutcome,
}: {
  result: Result;
  search: Search;
  cities: City[];
  outcome: Outcome | undefined;
  onOutcome: (outcome: Outcome | null) => void;
}) {
  const [mode, setMode] = useState<"idle" | "create" | "link">("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const done = isDone(outcome);
  const importable = result.status !== "no_location" && result.lat !== null && result.lng !== null;

  function link(target: { id: string }) {
    if (result.lat === null || result.lng === null) return;
    const input = {
      restaurantId: target.id,
      googlePlaceId: result.googlePlaceId,
      lat: result.lat,
      lng: result.lng,
      fetchedAt: result.fetchedAt,
      dishSlug: search.dish.slug,
    };
    startTransition(async () => {
      let res;
      try {
        res = await importLinkAction(input);
      } catch {
        onOutcome({ kind: "error", message: UNREACHABLE });
        return;
      }
      if (res.error) {
        onOutcome({ kind: "error", message: describeActionError(res.error) });
        return;
      }
      const data = res.data;
      if (data.outcome === "possible_duplicate") {
        onOutcome({ kind: "refused", message: data.message, restaurantId: data.restaurant.id });
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
    if (result.lat === null || result.lng === null) return;
    // Only the place id, location and fetch time come from the result; name and address were typed.
    const input = {
      ...values,
      googlePlaceId: result.googlePlaceId,
      lat: result.lat,
      lng: result.lng,
      fetchedAt: result.fetchedAt,
      dishSlug: search.dish.slug,
    };
    startTransition(async () => {
      let res;
      try {
        res = await importCreateAction(input);
      } catch {
        setCreateError(UNREACHABLE);
        return;
      }
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
    <article className={`flex flex-col gap-3 rounded-lg border p-3 ${done ? "opacity-60" : ""}`}>
      <div
        className="flex flex-col gap-1 rounded-md bg-muted/50 p-2"
        aria-label="Google Maps listing"
      >
        <GoogleMapsAttribution />
        <p className="font-medium">{result.displayName || "(no name)"}</p>
        <p className="text-sm text-muted-foreground">{result.formattedAddress || "(no address)"}</p>
        {result.attributions.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Data:{" "}
            {result.attributions.map((a, i) => (
              <span key={`${a.provider}-${i}`}>
                {i > 0 && ", "}
                {a.providerUri?.startsWith("https://") ? (
                  <a
                    href={a.providerUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {a.provider}
                  </a>
                ) : (
                  a.provider
                )}
              </span>
            ))}
          </p>
        )}
        <a
          href={result.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start text-sm underline"
        >
          Open in Google Maps
        </a>
      </div>

      <div className="flex flex-col gap-2" aria-label="In DishRank">
        <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          In DishRank
          <Badge variant={result.status === "new" ? "secondary" : "outline"}>
            {STATUS_LABEL[result.status]}
          </Badge>
        </p>

        {!importable && (
          <p className="text-sm">
            Google gives no location for this place, so it cannot be imported.
          </p>
        )}

        {result.existing && (
          <p className="text-sm">
            Already imported as{" "}
            <RestaurantLink id={result.existing.id}>{result.existing.name}</RestaurantLink> (
            {result.existing.areaName ?? "no area"}, {result.existing.cityName})
            {result.existing.hasDish ? `; it already has ${search.dish.name}.` : "."}
          </p>
        )}

        {result.duplicates.length > 0 && (
          <div className="flex flex-col gap-1 text-sm">
            <p>Possible duplicate of:</p>
            <ul className="flex flex-col gap-1">
              {result.duplicates.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <RestaurantLink id={d.id}>{d.name}</RestaurantLink> ({d.areaName ?? "no area"},{" "}
                    {d.cityName}, similarity {d.similarity})
                  </span>
                  {d.otherGooglePlace ? (
                    <span className="text-xs text-muted-foreground">
                      Linked to another Google place: if it is the same restaurant, merge in
                      Restaurants.
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || done || !importable}
                      onClick={() => link(d)}
                    >
                      Link
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {outcome && (
          <p
            role="status"
            className={
              outcome.kind === "error" || outcome.kind === "refused"
                ? "text-sm text-destructive"
                : "text-sm font-medium"
            }
          >
            {outcome.message}{" "}
            {outcome.restaurantId && outcome.kind !== "error" && (
              <RestaurantLink id={outcome.restaurantId}>Open</RestaurantLink>
            )}
          </p>
        )}

        {done ? (
          outcome?.kind === "skipped" && (
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() => onOutcome(null)}
            >
              Undo skip
            </Button>
          )
        ) : (
          <div className="flex flex-wrap gap-2">
            {importable &&
              (result.existing ? (
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
              ))}
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
            idPrefix={`create-${search.id}-${result.googlePlaceId}`}
            cities={cities}
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
      </div>
    </article>
  );
}
