"use client";

// The list behind "Rate the places you know" (docs/01 D4a): one tap per score, several places on one
// screen, plus a search for a place that is not listed. Every score goes to POST /api/v1/ratings, the
// same RatingService as the rate flow with all its rules and limits. A fetch, not a server action, so
// a tap does not re-render the whole page. A rating the diner gave earlier is never replaced from
// here: it may have a comment and a photo, so "Change" opens the full form.
import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PWA_EVENTS, noteRating } from "@/lib/pwa-prompt";
import { quickRatePlacesAction } from "@/server/actions/rating";
import type { QuickRateData, QuickRatePlace } from "@/server/services/rate-page.service";

const FIRST = 12;
const MORE = 20;

type RowState =
  | { kind: "saving"; score: number }
  | { kind: "saved"; score: number; held: boolean }
  | { kind: "error"; score: number | null; message: string };

type SearchHit = { id: string; slug: string; name: string; area: string | null };

const SCORES = Array.from({ length: 10 }, (_, i) => i + 1);

function PlaceRow({
  place,
  state,
  citySlug,
  dishSlug,
  onScore,
}: {
  place: QuickRatePlace;
  state: RowState | undefined;
  citySlug: string;
  dishSlug: string;
  onScore: (place: QuickRatePlace, score: number) => void;
}) {
  const chosen = state && state.kind !== "error" ? state.score : null;
  return (
    <li className="flex flex-col gap-2 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-display text-lg leading-tight font-bold break-anywhere">
          {place.name}
        </span>
        {place.area && <span className="text-sm text-muted-foreground">{place.area}</span>}
      </div>
      {place.mine ? (
        <p className="text-sm text-muted-foreground">
          You gave it {place.mine.score}
          {place.mine.status === "ACTIVE" ? "" : " (under review)"}.{" "}
          <Link
            href={`/rate?city=${citySlug}&r=${place.slug}&d=${dishSlug}`}
            prefetch={false}
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            Change
          </Link>
        </p>
      ) : (
        <>
          <div
            role="group"
            aria-label={`Your score for ${place.name}`}
            className="grid grid-cols-5 gap-1.5 min-[430px]:grid-cols-10"
          >
            {SCORES.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={chosen === n}
                aria-label={`${n} out of 10 for ${place.name}`}
                disabled={state?.kind === "saving"}
                onClick={() => onScore(place, n)}
                className="min-h-11 rounded-lg border border-border bg-card font-display text-base font-bold transition-colors active:bg-muted disabled:opacity-60 aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white"
              >
                {n}
              </button>
            ))}
          </div>
          {state?.kind === "saved" && (
            <p role="status" className="text-sm text-muted-foreground">
              {state.held ? "Saved. It is waiting for a check before it counts." : "Saved."}
            </p>
          )}
          {state?.kind === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
        </>
      )}
    </li>
  );
}

export default function QuickRatePanel({
  citySlug,
  dishSlug,
}: {
  citySlug: string;
  dishSlug: string;
}) {
  const [data, setData] = useState<QuickRateData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<QuickRatePlace[]>([]);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [limit, setLimit] = useState(FIRST);
  const [q, setQ] = useState("");
  // Results remember the text they answer, so a stale answer is never shown.
  const [results, setResults] = useState<{ text: string; hits: SearchHit[] } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    quickRatePlacesAction({ city: citySlug, dish: dishSlug })
      .then((res) => {
        if (!live) return;
        if (res.error) {
          setLoadError(res.error.message);
          return;
        }
        setData(res.data);
        setRows(res.data.places);
      })
      .catch(() => {
        if (live) setLoadError("The list could not be loaded. Check the connection and try again.");
      });
    return () => {
      live = false;
    };
  }, [citySlug, dishSlug]);

  const text = q.trim();
  useEffect(() => {
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/restaurants/search?city=${encodeURIComponent(citySlug)}&q=${encodeURIComponent(text)}`,
          { signal: controller.signal },
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? "Search failed");
        setSearchError(null);
        setResults({ text, hits: body.data as SearchHit[] });
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setSearchError("Search is not working right now. Try again.");
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, citySlug]);

  const matches = useMemo(() => {
    if (text.length < 2) return rows;
    const needle = text.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(needle));
  }, [rows, text]);

  const listedIds = new Set(rows.map((r) => r.restaurantId));
  const others: QuickRatePlace[] =
    text.length >= 2 && results?.text === text
      ? results.hits
          .filter((hit) => !listedIds.has(hit.id))
          .map((hit) => ({
            restaurantId: hit.id,
            slug: hit.slug,
            name: hit.name,
            area: hit.area,
            mine: null,
          }))
      : [];

  async function rate(place: QuickRatePlace, score: number) {
    if (!data) return;
    const id = place.restaurantId;
    setStates((prev) => ({ ...prev, [id]: { kind: "saving", score } }));
    try {
      const res = await fetch("/api/v1/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantId: id, dishId: data.dish.id, score }),
      });
      const body = (await res.json()) as {
        data?: { held: boolean; created: boolean };
        error?: { message: string };
      };
      if (!res.ok || !body.data) {
        setStates((prev) => ({
          ...prev,
          [id]: {
            kind: "error",
            score: null,
            message: body.error?.message ?? "That did not save. Try again.",
          },
        }));
        return;
      }
      const saved = body.data;
      setStates((prev) => ({ ...prev, [id]: { kind: "saved", score, held: saved.held } }));
      // A place found by search stays on the list once it has the diner's score.
      setRows((prev) => (prev.some((r) => r.restaurantId === id) ? prev : [place, ...prev]));
      if (saved.created) {
        // The install prompt may show after the second saved rating.
        noteRating();
        window.dispatchEvent(new Event(PWA_EVENTS.rated));
      }
    } catch {
      setStates((prev) => ({
        ...prev,
        [id]: {
          kind: "error",
          score: null,
          message: "That did not reach the server. Check the connection and try again.",
        },
      }));
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {loadError}
      </p>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Loading places…</p>;

  const savedCount = Object.values(states).filter((s) => s.kind === "saved").length;
  const shown = matches.slice(0, limit);
  const left = matches.length - shown.length;
  const row = (place: QuickRatePlace) => (
    <PlaceRow
      key={place.restaurantId}
      place={place}
      state={states[place.restaurantId]}
      citySlug={citySlug}
      dishSlug={dishSlug}
      onScore={rate}
    />
  );

  return (
    <section
      aria-labelledby="quick-rate"
      className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-3 sm:p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="quick-rate" className="text-xl font-bold">
          Rate the places you know
        </h2>
        <p className="text-sm">
          Only rate places where you&apos;ve had {data.dish.name}. One tap saves your score, 1 to
          10.
        </p>
        {savedCount > 0 && (
          <p role="status" className="text-sm font-medium text-brand">
            {savedCount} saved. Thank you.
          </p>
        )}
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Find a place in {data.city.name}
        <span className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(FIRST);
            }}
            placeholder="e.g. Butt Karahi"
            autoComplete="off"
            enterKeyHint="search"
            className="field h-12 pl-11 font-normal"
          />
        </span>
      </label>
      {searchError && (
        <p role="alert" className="text-sm text-destructive">
          {searchError}
        </p>
      )}

      {shown.length > 0 && (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-card">
          {shown.map(row)}
        </ul>
      )}
      {left > 0 && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setLimit((n) => n + MORE)}
        >
          Show more ({left} left)
        </Button>
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-bold">Not listed for {data.dish.name} yet</h3>
          <p className="text-sm text-muted-foreground">
            Your rating adds {data.dish.name} to that place.
          </p>
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-card">
            {others.map(row)}
          </ul>
        </div>
      )}

      {shown.length === 0 && others.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed bg-card p-4">
          <p className="font-medium">
            {text.length >= 2
              ? results?.text === text
                ? `Nothing found for "${text}" in ${data.city.name}.`
                : "Searching…"
              : `No place is listed for ${data.dish.name} in ${data.city.name} yet. Search for one you know.`}
          </p>
          {text.length >= 2 && results?.text === text && (
            <Link
              href={`/rate?city=${citySlug}`}
              prefetch={false}
              className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline"
            >
              Suggest the restaurant
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
