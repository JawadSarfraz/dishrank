"use client";

// The ranked list with its filter bar (docs/08 Phase 4): the page sends every ranked row, and this
// filters and sorts them in the browser. Filters live in the URL (?area=&min=&votes=&sort=) so a
// link keeps them; on phones they open in a bottom sheet. "Near me" asks for the location only when
// tapped, never sends it anywhere, and puts restaurants without a location last. Ranks are city-wide
// and never renumbered. Each row (spec §4, Ranking row) is one link to the restaurant page: the rank
// (#1 in a gold circle, others a plain numeral), name and area, the rater count large and the score
// small; rating a ranked place goes through "Rate the places you know" above the list.
import { MapPinIcon, SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { CONTROL_BUTTON, CONTROL_SELECT, ListHeader } from "@/components/dish/PlaceRow";
import { RankDisc } from "@/components/ranking/RankDisc";
import { ScorePill } from "@/components/ranking/ScoreBadge";
import { Button } from "@/components/ui/button";
import { RowList } from "@/components/ui/kit";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { haversineKm } from "@/lib/geo";
import { formatFromPrice, formatKm } from "@/lib/format";
import { useNearMe } from "./use-near-me";

export type BrowserRow = {
  rank: number;
  slug: string;
  name: string;
  area: { slug: string; name: string } | null;
  score: number;
  votes: number;
  price: number | null;
  tags: string[];
  lat: number | null;
  lng: number | null;
};

type Sort = "score" | "votes" | "price" | "distance";
type Filters = { area: string; min: number; votes: number; sort: Sort };

const SORTS: { value: Sort; label: string }[] = [
  { value: "score", label: "Best score" },
  { value: "votes", label: "Most votes" },
  { value: "price", label: "Lowest price" },
  { value: "distance", label: "Nearest" },
];
const MIN_SCORES = [0, 6, 7, 8, 9];
const MIN_VOTES = [0, 5, 10, 25, 50];

const CHANGED = "dishrank:filters";
function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}
const readSearch = () => window.location.search;
const serverSearch = () => "";

function parse(search: string): Filters {
  const p = new URLSearchParams(search);
  const num = (key: string, allowed: number[]) => {
    const n = Number(p.get(key));
    return allowed.includes(n) ? n : 0;
  };
  const sort = p.get("sort");
  return {
    area: p.get("area") ?? "",
    min: num("min", MIN_SCORES),
    votes: num("votes", MIN_VOTES),
    sort: SORTS.some((s) => s.value === sort) ? (sort as Sort) : "score",
  };
}

export function RankingBrowser({
  rows,
  citySlug,
  updated,
}: {
  rows: BrowserRow[];
  citySlug: string;
  /** "13 Nov": the newest counted rating on the list, formatted on the server. */
  updated?: string | null;
}) {
  const filters = parse(useSyncExternalStore(subscribe, readSearch, serverSearch));
  const { here, locating, locate } = useNearMe();

  const areas = useMemo(() => {
    const byslug = new Map<string, string>();
    for (const r of rows) if (r.area) byslug.set(r.area.slug, r.area.name);
    return [...byslug].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  function update(next: Partial<Filters>) {
    const merged = { ...filters, ...next };
    const p = new URLSearchParams();
    if (merged.area) p.set("area", merged.area);
    if (merged.min) p.set("min", String(merged.min));
    if (merged.votes) p.set("votes", String(merged.votes));
    if (merged.sort !== "score") p.set("sort", merged.sort);
    const query = p.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    window.dispatchEvent(new Event(CHANGED));
  }

  const shown = useMemo(() => {
    const distance = (r: BrowserRow) =>
      here && r.lat !== null && r.lng !== null
        ? haversineKm(here, { lat: r.lat, lng: r.lng })
        : null;
    const list = rows
      .filter((r) => !filters.area || r.area?.slug === filters.area)
      .filter((r) => r.score >= filters.min && r.votes >= filters.votes)
      .map((r) => ({ ...r, km: distance(r) }));
    const by: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      score: (a, b) => a.rank - b.rank,
      votes: (a, b) => b.votes - a.votes || a.rank - b.rank,
      price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.rank - b.rank,
      // Without a location yet, or for restaurants without one: by rank, after the located ones.
      distance: (a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.rank - b.rank,
    };
    return list.sort(by[filters.sort]);
  }, [rows, filters.area, filters.min, filters.votes, filters.sort, here]);

  const activeFilters =
    Number(filters.area !== "") + Number(filters.min > 0) + Number(filters.votes > 0);
  const reset = () => update({ area: "", min: 0, votes: 0 });

  return (
    <section aria-labelledby="full-ranking" className="flex flex-col gap-3">
      {/* An ISR page cannot say "3 days ago"; an absolute date stays true until the next rating. */}
      <ListHeader
        id="full-ranking"
        title="Full ranking"
        count={`${rows.length} ranked`}
        note={updated ? `Updated ${updated} · scores out of 10` : "Scores out of 10"}
      />
      <div role="group" aria-label="Filter and sort" className="flex items-center gap-2">
        <Sheet>
          <SheetTrigger render={<Button variant="outline" className={CONTROL_BUTTON} />}>
            <SlidersHorizontalIcon aria-hidden="true" className="size-[18px]" />
            Filters
            {activeFilters > 0 && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {activeFilters}
                <span className="sr-only"> active</span>
              </span>
            )}
          </SheetTrigger>
          <SheetContent side="bottom" className="mx-auto w-full sm:max-w-md sm:rounded-t-sheet">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Rank numbers stay as they are for the whole city.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Area
                <select
                  className="field field-select"
                  value={filters.area}
                  onChange={(e) => update({ area: e.target.value })}
                >
                  <option value="">All areas</option>
                  {areas.map(([slug, name]) => (
                    <option key={slug} value={slug}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Minimum score
                <select
                  className="field field-select"
                  value={filters.min}
                  onChange={(e) => update({ min: Number(e.target.value) })}
                >
                  {MIN_SCORES.map((n) => (
                    <option key={n} value={n}>
                      {n ? `${n} and up` : "Any score"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Minimum votes
                <select
                  className="field field-select"
                  value={filters.votes}
                  onChange={(e) => update({ votes: Number(e.target.value) })}
                >
                  {MIN_VOTES.map((n) => (
                    <option key={n} value={n}>
                      {n ? `${n} or more` : "Any number"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <SheetFooter className="flex-row">
              <Button type="button" variant="ghost" onClick={reset} disabled={activeFilters === 0}>
                Reset
              </Button>
              <SheetClose render={<Button type="button" className="flex-1" />}>
                Show {shown.length} restaurant{shown.length === 1 ? "" : "s"}
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <label className="sr-only" htmlFor="ranking-sort">
          Sort
        </label>
        <select
          id="ranking-sort"
          className={`${CONTROL_SELECT} w-auto min-w-0 flex-1`}
          value={filters.sort}
          onChange={(e) => update({ sort: e.target.value as Sort })}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          className={CONTROL_BUTTON}
          onClick={() => locate(() => update({ sort: "distance" }))}
          disabled={locating === "busy"}
          aria-pressed={here !== null}
          aria-label="Near me"
        >
          <MapPinIcon aria-hidden="true" className="size-[18px]" />
          <span className="hidden min-[400px]:inline">
            {locating === "busy" ? "Finding you…" : here ? "Near me (on)" : "Near me"}
          </span>
        </Button>
      </div>
      {locating === "failed" && (
        <p role="alert" className="text-sm text-muted-foreground">
          Your location is not available, so the list stays in rank order.
        </p>
      )}
      {filters.sort === "distance" && !here && locating !== "busy" && (
        <p className="text-sm text-muted-foreground">Tap “Near me” to sort by distance.</p>
      )}

      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-dash bg-card p-4">
          <p className="font-semibold">No restaurant matches these filters.</p>
          {activeFilters > 0 && (
            <Button type="button" variant="outline" onClick={reset}>
              Show all {rows.length}
            </Button>
          )}
        </div>
      ) : (
        <RowList ordered aria-label="Ranked restaurants">
          {shown.map((r) => (
            <li key={r.slug}>
              <Link
                href={`/${citySlug}/r/${r.slug}`}
                className="group grid min-h-17 grid-cols-[36px_minmax(0,1fr)_44px_minmax(40px,auto)] items-center gap-2 py-2.5 pr-3 pl-2.5 hover:bg-sand/60"
              >
                <RankDisc rank={r.rank} plain className="justify-self-center" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-base leading-[22px] font-bold break-anywhere underline-offset-2 group-hover:underline">
                    {r.name}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {[
                      r.area?.name,
                      r.km !== null ? formatKm(r.km) : null,
                      r.price !== null ? formatFromPrice(r.price) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {r.tags.length > 0 && (
                    <span className="flex flex-wrap gap-1.5 pt-0.5">
                      {r.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-sand px-2 py-0.5 text-xs font-semibold"
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="flex flex-col items-center">
                  <span className="font-display text-[22px] leading-6 font-extrabold tabular-nums">
                    {r.votes}
                  </span>
                  <span className="text-[11px] leading-[14px] font-semibold text-muted-foreground">
                    {r.votes === 1 ? "rater" : "raters"}
                  </span>
                </span>
                <span className="justify-self-end">
                  <span className="sr-only">Score </span>
                  <ScorePill score={r.score} size="sm" />
                </span>
              </Link>
            </li>
          ))}
        </RowList>
      )}
    </section>
  );
}
