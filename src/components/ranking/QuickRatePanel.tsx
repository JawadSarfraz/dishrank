"use client";

// The list behind "Rate the places you know" (docs/01 D4a): one tap per score, several places on one
// screen, plus a search for a place that is not listed. Every score goes to POST /api/v1/ratings, the
// same RatingService as the rate flow with all its rules and limits. A fetch, not a server action, so
// a tap does not re-render the whole page. A rating the diner gave earlier is never replaced from
// here: it may have a comment and a photo, so "Change" opens the full form. A signed-out diner's tap
// opens the rate flow's score step with that score filled in: it offers the sign-in, in any browser,
// and the score is still there after it.
import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { withPendingScore } from "@/lib/pending-score";
import { PWA_EVENTS, noteRating } from "@/lib/pwa-prompt";
import { quickRatePlacesAction } from "@/server/actions/rating";
import type { QuickRateData, QuickRatePlace } from "@/server/services/rate-page.service";

const FIRST = 12;
const MORE = 20;

/** One place's taps: what is saved stays known while a new tap is on its way, or was refused. */
type RowState = {
  saved: { score: number; held: boolean } | null;
  saving: number | null;
  error: string | null;
};

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
  const chosen = state?.saving ?? state?.saved?.score ?? null;
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
          {place.mine.status === "HELD"
            ? " (under review)"
            : place.mine.status === "HIDDEN"
              ? " (not counted)"
              : ""}
          .{" "}
          <Link
            href={`/rate?city=${citySlug}&r=${place.slug}&d=${dishSlug}`}
            prefetch={false}
            className="inline-flex min-h-11 items-center font-medium text-brand underline-offset-4 hover:underline"
          >
            Change
          </Link>
        </p>
      ) : (
        <>
          <div
            role="group"
            aria-label={`Your score for ${place.name}`}
            className="grid grid-cols-5 gap-1.5 sm:grid-cols-10"
          >
            {SCORES.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={chosen === n}
                aria-label={`${n} out of 10 for ${place.name}`}
                disabled={state?.saving != null}
                onClick={() => onScore(place, n)}
                className="min-h-11 rounded-lg border border-border bg-card font-display text-base font-bold transition-colors active:bg-muted disabled:opacity-60 aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white"
              >
                {n}
              </button>
            ))}
          </div>
          <div aria-hidden="true" className="flex justify-between text-xs text-muted-foreground">
            <span>1 = bad</span>
            <span>10 = best I&apos;ve had</span>
          </div>
          {state?.saved && !state.saving && (
            <p role="status" className="text-sm text-muted-foreground">
              {state.saved.held ? "Saved. It is waiting for a check before it counts." : "Saved."}
            </p>
          )}
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
              {state.saved ? ` Your ${state.saved.score} is still saved.` : ""}
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
  seed,
}: {
  citySlug: string;
  dishSlug: string;
  /** The page's shuffle seed: the contenders open in the order the page showed them. */
  seed: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<QuickRateData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<QuickRatePlace[]>([]);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [limit, setLimit] = useState(FIRST);
  const [q, setQ] = useState("");
  // Results remember the text they answer, so a stale answer is never shown.
  const [results, setResults] = useState<{ text: string; hits: SearchHit[] } | null>(null);
  // Remembers the text it belongs to, so it goes away with that text.
  const [searchError, setSearchError] = useState<{ text: string; message: string } | null>(null);

  useEffect(() => {
    let live = true;
    quickRatePlacesAction({ city: citySlug, dish: dishSlug, seed })
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
  }, [citySlug, dishSlug, seed]);

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
          setSearchError({ text, message: "Search is not working right now. Try again." });
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, citySlug]);

  const searched = text.length >= 2;
  const hits = useMemo(
    () => (searched && results?.text === text ? results.hits : []),
    [searched, results, text],
  );

  // The search is tolerant ("but karahi" finds Butt Karahi), so its hits count as matches too.
  const matches = useMemo(() => {
    if (!searched) return rows;
    const needle = text.toLowerCase();
    const hitIds = new Set(hits.map((hit) => hit.id));
    return rows.filter((r) => r.name.toLowerCase().includes(needle) || hitIds.has(r.restaurantId));
  }, [rows, searched, text, hits]);

  const listedIds = new Set(rows.map((r) => r.restaurantId));
  const others: QuickRatePlace[] = hits
    .filter((hit) => !listedIds.has(hit.id))
    .map((hit) => {
      const own = data?.mine.find((r) => r.restaurantId === hit.id);
      return {
        restaurantId: hit.id,
        slug: hit.slug,
        name: hit.name,
        area: hit.area,
        mine: own ? { score: own.score, status: own.status } : null,
      };
    });
  const searchFailed = searched && searchError?.text === text;

  async function rate(place: QuickRatePlace, score: number) {
    if (!data) return;
    if (!data.signedIn) {
      router.push(withPendingScore(`/rate?city=${citySlug}&r=${place.slug}&d=${dishSlug}`, score));
      return;
    }
    const id = place.restaurantId;
    // The same score again changes nothing, and every submission counts toward the daily limits.
    if (states[id]?.saved?.score === score) return;
    const update = (next: Partial<RowState>) =>
      setStates((prev) => {
        const current = prev[id] ?? { saved: null, saving: null, error: null };
        return { ...prev, [id]: { ...current, ...next } };
      });
    update({ saving: score, error: null });
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
        update({ saving: null, error: body.error?.message ?? "That did not save. Try again." });
        return;
      }
      const saved = body.data;
      update({ saved: { score, held: saved.held }, saving: null, error: null });
      // A place found by search stays on the list once it has the diner's score.
      setRows((prev) => (prev.some((r) => r.restaurantId === id) ? prev : [place, ...prev]));
      if (saved.created) {
        // The install prompt may show after the second saved rating.
        noteRating();
        window.dispatchEvent(new Event(PWA_EVENTS.rated));
      }
    } catch {
      update({
        saving: null,
        error: "That did not reach the server. Check the connection and try again.",
      });
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

  const savedCount = Object.values(states).filter((s) => s.saved).length;
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
          Only rate places where you&apos;ve had {data.dish.name}.{" "}
          {data.signedIn
            ? "One tap saves your score, 1 to 10."
            : "Tap your score, 1 to 10. You sign in once, and your score stays."}
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
      {searchFailed && (
        <p role="alert" className="text-sm text-destructive">
          {searchError.message}
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

      {shown.length === 0 && others.length === 0 && !searchFailed && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed bg-card p-4">
          <p className="font-medium">
            {searched
              ? results?.text === text
                ? `Nothing found for "${text}" in ${data.city.name}.`
                : "Searching…"
              : `No place is listed for ${data.dish.name} in ${data.city.name} yet. Search for one you know.`}
          </p>
          {searched && results?.text === text && (
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
