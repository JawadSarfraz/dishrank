"use client";

// The list behind "Rate the places you know" (docs/01 D4a, spec §4 Score row, §5): one tap per
// score, several places on one screen, plus a search for a place that is not listed. Every score
// goes to POST /api/v1/ratings, the same RatingService as the rate flow with all its rules and
// limits. A fetch, not a server action, so a tap does not re-render the whole page. A rating the
// diner gave earlier is never replaced from here: it may have a comment and a photo, so "Change"
// opens the full form. A signed-out diner's tap opens the rate flow's score step with that score
// filled in: it offers the sign-in, in any browser, and the score is still there after it.
//
// Undo takes back this screen's last tap on a place: the score before it is saved again, or, when
// there was none, the new rating is deleted (DELETE /api/v1/ratings/:id). A held rating cannot be
// deleted by its author, and the bar says so.
import { CheckIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "cn";
import { RateSkeleton } from "@/components/rate/RateSkeleton";
import { ScoreGrid } from "@/components/rate/ScoreGrid";
import { Button } from "@/components/ui/button";
import { AddRow } from "@/components/ui/kit";
import { suggestPlacePath } from "@/lib/paths";
import { withPendingScore } from "@/lib/pending-score";
import { PWA_EVENTS, noteRating } from "@/lib/pwa-prompt";
import { quickRatePlacesAction } from "@/server/actions/rating";
import type { QuickRateData, QuickRatePlace } from "@/server/services/rate-page.service";

const FIRST = 12;
/** "Show all" opens the whole list up to this many more; a longer one opens in steps. */
const ALL_AT_ONCE = 40;
const MORE = 20;

/** One saved score, with what the server said about it. */
type Saved = {
  ratingId: string;
  score: number;
  held: boolean;
  hidden: boolean;
  stale: boolean;
};

/** One place's taps on this screen: the scores saved in turn (Undo walks back), a tap on its way. */
type RowState = {
  saved: Saved[];
  saving: number | null;
  undoing: boolean;
  error: { message: string; retry: number | null } | null;
  note: string | null;
};

const EMPTY: RowState = { saved: [], saving: null, undoing: false, error: null, note: null };

type SearchHit = { id: string; slug: string; name: string; area: string | null };

type RatingReply = {
  data?: { ratingId: string; held: boolean; created: boolean; status: string; stale: boolean };
  error?: { code?: string; message: string };
};

/** The saved bar's sentence: "Counts right away" only when the server says it counted. */
function savedLine(s: Saved) {
  if (s.hidden) return `Saved: ${s.score}. It does not count: a moderator hid your rating here.`;
  if (s.held) return `Saved: ${s.score}. It is waiting for a check before it counts.`;
  if (s.stale) return `Saved: ${s.score}. The list updates in a moment.`;
  return `Saved: ${s.score}. Counts right away.`;
}

const textButton =
  "inline-flex h-11 shrink-0 items-center px-3 text-sm font-bold text-ink underline underline-offset-[3px] hover:text-brand-press";

/** A place the diner rated before this screen opened: one line, the score, and "Change". */
function RatedRow({
  place,
  citySlug,
  dishSlug,
}: {
  place: QuickRatePlace;
  citySlug: string;
  dishSlug: string;
}) {
  const mine = place.mine!;
  const status =
    mine.status === "HELD" ? " (under review)" : mine.status === "HIDDEN" ? " (not counted)" : "";
  return (
    <li className="flex min-h-18 items-center gap-2.5 rounded-card border bg-card py-3 pr-2 pl-4">
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <h3 className="text-base leading-[22px] font-bold break-anywhere">{place.name}</h3>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {place.area ? `${place.area} · you gave it` : "You gave it"}
          {status}
        </p>
      </div>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand font-display text-xl leading-none font-extrabold text-white">
        {mine.score}
      </span>
      <Link
        href={`/rate?city=${citySlug}&r=${place.slug}&d=${dishSlug}`}
        prefetch={false}
        aria-label={`Change your score for ${place.name}`}
        className={cn(textButton, "px-2.5")}
      >
        Change
      </Link>
    </li>
  );
}

function PlaceRow({
  place,
  state,
  onScore,
  onUndo,
}: {
  place: QuickRatePlace;
  state: RowState | undefined;
  onScore: (place: QuickRatePlace, score: number) => void;
  onUndo: (place: QuickRatePlace) => void;
}) {
  const current = state?.saved.at(-1) ?? null;
  const chosen = state?.saving ?? current?.score ?? null;
  const busy = state?.saving != null || Boolean(state?.undoing);
  return (
    <li
      className={cn(
        "flex flex-col gap-2.5 rounded-card border bg-card px-4 pt-3.5 pb-3 shadow-card",
        chosen !== null && "border-[1.5px] border-brand",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 text-base leading-[22px] font-bold break-anywhere">{place.name}</h3>
        {place.area && (
          <span className="shrink-0 text-[13px] leading-[18px] text-muted-foreground">
            {place.area}
          </span>
        )}
      </div>
      <ScoreGrid
        value={chosen}
        busy={busy}
        label={`Your score for ${place.name}, 1 to 10`}
        buttonLabel={(n) => `${n} out of 10 for ${place.name}`}
        onPick={(n) => onScore(place, n)}
      />
      {state?.error ? (
        <div
          role="alert"
          className="flex min-h-11 items-center gap-2 rounded-control border border-ink bg-card py-0 pr-1 pl-3"
        >
          <span className="grow py-2 text-[13px] leading-[18px] font-bold">
            {state.error.message}
          </span>
          {state.error.retry !== null && (
            <button
              type="button"
              className={textButton}
              onClick={() => onScore(place, state.error!.retry!)}
            >
              Retry
            </button>
          )}
        </div>
      ) : current && state?.saving == null ? (
        <div className="flex min-h-11 items-center gap-2 rounded-control bg-blush py-0 pr-1 pl-3">
          <CheckIcon
            aria-hidden="true"
            className="size-[18px] shrink-0 text-brand-dark"
            strokeWidth={2.6}
          />
          <p
            role="status"
            className="grow py-2 text-[13px] leading-[18px] font-bold text-brand-dark"
          >
            {state?.undoing ? "Undoing…" : savedLine(current)}
          </p>
          <button
            type="button"
            className={textButton}
            disabled={busy}
            onClick={() => onUndo(place)}
          >
            Undo
          </button>
        </div>
      ) : state?.note ? (
        <p role="status" className="text-[13px] leading-[18px] text-muted-foreground">
          {state.note}
        </p>
      ) : null}
    </li>
  );
}

export default function QuickRatePanel({
  citySlug,
  dishSlug,
  seed,
  onMeta,
  onSaved,
  onDone,
}: {
  citySlug: string;
  dishSlug: string;
  /** The page's shuffle seed: the contenders open in the order the page showed them. */
  seed: string;
  /** The dish and city names, for the screen's back line. */
  onMeta: (meta: { dish: string; city: string }) => void;
  /** How many places have a score saved from this screen. */
  onSaved: (count: number) => void;
  /** "Done": back to the dish page. */
  onDone: () => void;
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
        // The places rated before come first, collapsed; the rest keep the page's order.
        setRows([
          ...res.data.places.filter((p) => p.mine),
          ...res.data.places.filter((p) => !p.mine),
        ]);
        onMeta({ dish: res.data.dish.name, city: res.data.city.name });
      })
      .catch(() => {
        if (live) setLoadError("The list could not be loaded. Check the connection and try again.");
      });
    return () => {
      live = false;
    };
  }, [citySlug, dishSlug, seed, onMeta]);

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

  const savedCount = Object.values(states).filter((s) => s.saved.length > 0).length;
  useEffect(() => onSaved(savedCount), [savedCount, onSaved]);

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

  const update = (id: string, next: (current: RowState) => Partial<RowState>) =>
    setStates((prev) => {
      const current = prev[id] ?? EMPTY;
      return { ...prev, [id]: { ...current, ...next(current) } };
    });

  /** POST one score; null when it did not save (the row shows why). */
  async function post(place: QuickRatePlace, score: number): Promise<Saved | null> {
    const id = place.restaurantId;
    try {
      const res = await fetch("/api/v1/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantId: id, dishId: data!.dish.id, score }),
      });
      const body = (await res.json()) as RatingReply;
      if (!res.ok || !body.data) {
        update(id, () => ({
          error: { message: `Couldn't save. ${body.error?.message ?? "Try again."}`, retry: score },
        }));
        return null;
      }
      if (body.data.created) {
        // The install prompt may show after the second saved rating.
        noteRating();
        window.dispatchEvent(new Event(PWA_EVENTS.rated));
      }
      return {
        ratingId: body.data.ratingId,
        score,
        held: body.data.held,
        hidden: body.data.status === "HIDDEN",
        stale: body.data.stale,
      };
    } catch {
      update(id, () => ({
        error: { message: "Couldn't save. Check the connection and try again.", retry: score },
      }));
      return null;
    }
  }

  async function rate(place: QuickRatePlace, score: number) {
    if (!data) return;
    if (!data.signedIn) {
      router.push(withPendingScore(`/rate?city=${citySlug}&r=${place.slug}&d=${dishSlug}`, score));
      return;
    }
    const id = place.restaurantId;
    const state = states[id] ?? EMPTY;
    if (state.saving !== null || state.undoing) return;
    // The same score again changes nothing, and every submission counts toward the daily limits.
    if (state.saved.at(-1)?.score === score && !state.error) return;
    update(id, () => ({ saving: score, error: null, note: null }));
    const saved = await post(place, score);
    if (!saved) {
      // The selection goes back to what is saved; the bar says it did not save.
      update(id, (cur) => ({
        saving: null,
        error: cur.error && {
          ...cur.error,
          message: cur.saved.length
            ? `${cur.error.message} Your ${cur.saved.at(-1)!.score} is still saved.`
            : cur.error.message,
        },
      }));
      return;
    }
    update(id, (cur) => ({ saved: [...cur.saved, saved], saving: null, error: null }));
    // A place found by search stays on the list once it has the diner's score.
    setRows((prev) => (prev.some((r) => r.restaurantId === id) ? prev : [place, ...prev]));
  }

  async function undo(place: QuickRatePlace) {
    const id = place.restaurantId;
    const state = states[id] ?? EMPTY;
    const last = state.saved.at(-1);
    if (!last || state.saving !== null || state.undoing) return;
    update(id, () => ({ undoing: true, error: null, note: null }));
    const before = state.saved.at(-2);
    if (before) {
      // A score from earlier on this screen: save it again.
      const again = await post(place, before.score);
      update(id, (cur) =>
        again
          ? { saved: [...cur.saved.slice(0, -2), again], undoing: false }
          : {
              undoing: false,
              error: {
                message: `Couldn't undo. Your ${last.score} is still saved.`,
                retry: null,
              },
            },
      );
      return;
    }
    try {
      const res = await fetch(`/api/v1/ratings/${encodeURIComponent(last.ratingId)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as RatingReply;
      if (!res.ok) {
        const held = body.error?.code === "RATING_UNDER_REVIEW";
        update(id, () => ({
          undoing: false,
          error: {
            message: held
              ? `This rating is held for a check, so it can't be undone now. Your ${last.score} stays saved.`
              : `Couldn't undo. ${body.error?.message ?? "Try again."} Your ${last.score} is still saved.`,
            retry: null,
          },
        }));
        return;
      }
      update(id, () => ({ saved: [], undoing: false, note: "Undone. No score saved here." }));
    } catch {
      update(id, () => ({
        undoing: false,
        error: {
          message: `Couldn't undo: check the connection. Your ${last.score} is still saved.`,
          retry: null,
        },
      }));
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="mt-4 text-sm text-destructive">
        {loadError}
      </p>
    );
  }
  if (!data) return <RateSkeleton />;

  const shown = matches.slice(0, limit);
  const left = matches.length - shown.length;
  const row = (place: QuickRatePlace) =>
    place.mine && !states[place.restaurantId] ? (
      <RatedRow key={place.restaurantId} place={place} citySlug={citySlug} dishSlug={dishSlug} />
    ) : (
      <PlaceRow
        key={place.restaurantId}
        place={place}
        state={states[place.restaurantId]}
        onScore={rate}
        onUndo={undo}
      />
    );

  return (
    <div className={cn("flex flex-col", savedCount > 0 && "pb-24")}>
      <p className="mt-2 text-sm leading-5 text-muted-foreground">
        {data.signedIn
          ? "One tap saves your score, 1 to 10. "
          : "Tap your score, 1 to 10. You sign in once, and your score stays. "}
        <strong className="font-bold text-ink">Sirf wahan rate karein jahan khaya ho.</strong>
      </p>

      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor="quick-rate-search" className="text-sm leading-5 font-semibold">
          Find a place in {data.city.name}
        </label>
        <span className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink"
          />
          <input
            id="quick-rate-search"
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(FIRST);
            }}
            placeholder="e.g. Butt Karahi"
            autoComplete="off"
            enterKeyHint="search"
            className="field h-12 pl-11 text-[15px]"
          />
        </span>
      </div>
      {searchFailed && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {searchError.message}
        </p>
      )}

      {shown.length > 0 && <ul className="mt-4 flex flex-col gap-3">{shown.map(row)}</ul>}
      {left > 0 && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="mt-3 w-full"
          onClick={() => setLimit((n) => (left <= ALL_AT_ONCE ? Infinity : n + MORE))}
        >
          {left <= ALL_AT_ONCE ? `Show all ${matches.length} places` : `Show ${MORE} more`}
        </Button>
      )}

      {others.length > 0 && (
        <section aria-labelledby="quick-rate-others" className="mt-6 flex flex-col gap-1">
          <h3 id="quick-rate-others" className="font-display text-xl leading-6 font-extrabold">
            Not listed for {data.dish.name} yet
          </h3>
          <p className="text-sm leading-5 text-muted-foreground">
            Your rating adds {data.dish.name} to that place.
          </p>
          <ul className="mt-2 flex flex-col gap-3">{others.map(row)}</ul>
        </section>
      )}

      {shown.length === 0 && others.length === 0 && !searchFailed && (
        <div className="mt-4 flex flex-col items-start gap-1 rounded-card bg-sand p-4">
          <p className="text-[15px] leading-5 font-semibold">
            {searched
              ? results?.text === text
                ? `Nothing found for "${text}" in ${data.city.name}.`
                : "Searching…"
              : `No place is listed for ${data.dish.name} in ${data.city.name} yet. Search for one you know.`}
          </p>
        </div>
      )}

      <AddRow href={suggestPlacePath(citySlug)} className="mt-3" />

      {savedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-6px_16px_rgba(27,20,16,0.06)]">
          <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 py-3">
            <p role="status" className="flex flex-col">
              <span className="text-[15px] leading-5 font-bold">
                {savedCount} {savedCount === 1 ? "place" : "places"} rated
              </span>
              <span className="text-xs leading-4 text-muted-foreground">Saved as you tap</span>
            </p>
            <Button type="button" size="lg" className="px-8" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
