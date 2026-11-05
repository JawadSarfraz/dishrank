"use client";

// The ranked list with its filter bar (docs/08 Phase 4): the page sends every ranked row, and this
// filters and sorts them in the browser. Filters live in the URL (?area=&min=&votes=&sort=) so a
// link keeps them; on phones they open in a bottom sheet. "Near me" asks for the location only when
// tapped, never sends it anywhere, and puts restaurants without a location last. Ranks are city-wide
// and never renumbered.
import { MapPinIcon, SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { RankDisc } from "@/components/ranking/RankDisc";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";
import { Button } from "@/components/ui/button";
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
  dishSlug,
}: {
  rows: BrowserRow[];
  citySlug: string;
  dishSlug: string;
}) {
  const filters = parse(useSyncExternalStore(subscribe, readSearch, serverSearch));
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "failed">("idle");

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

  function nearMe() {
    if (!("geolocation" in navigator)) {
      setLocating("failed");
      return;
    }
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating("idle");
        update({ sort: "distance" });
      },
      () => setLocating("failed"),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
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
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Filter and sort" className="flex flex-wrap items-center gap-2">
        <Sheet>
          <SheetTrigger render={<Button variant="outline" size="sm" className="h-11 text-base" />}>
            <SlidersHorizontalIcon aria-hidden="true" />
            Filters
            {activeFilters > 0 && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {activeFilters}
                <span className="sr-only"> active</span>
              </span>
            )}
          </SheetTrigger>
          <SheetContent side="bottom" className="mx-auto w-full sm:max-w-md sm:rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Rank numbers stay as they are for the whole city.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4">
              <label className="flex flex-col gap-1 text-sm font-medium">
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
              <label className="flex flex-col gap-1 text-sm font-medium">
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
              <label className="flex flex-col gap-1 text-sm font-medium">
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
          className="field field-select h-11 w-auto min-w-0 font-medium"
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
          size="sm"
          className="h-11 text-base"
          onClick={nearMe}
          disabled={locating === "busy"}
          aria-pressed={here !== null}
          aria-label="Near me"
        >
          <MapPinIcon aria-hidden="true" />
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
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed bg-card p-4">
          <p className="font-medium">No restaurant matches these filters.</p>
          {activeFilters > 0 && (
            <Button type="button" variant="secondary" onClick={reset}>
              Show all {rows.length}
            </Button>
          )}
        </div>
      ) : (
        <ol
          aria-label="Ranked restaurants"
          className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-card"
        >
          {shown.map((r) => (
            <li
              key={r.slug}
              className={`flex items-start gap-3 px-3 py-3 sm:px-4 ${
                r.rank === 1 ? "bg-linear-to-r from-gold-soft via-gold-soft/40 to-card" : ""
              }`}
            >
              <RankDisc rank={r.rank} className="mt-1" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link
                  href={`/${citySlug}/r/${r.slug}`}
                  className="inline-flex min-h-11 items-center font-display text-lg leading-tight font-bold break-anywhere underline-offset-4 hover:underline"
                >
                  {r.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {[r.area?.name, r.km !== null ? formatKm(r.km) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {(r.price !== null || r.tags.length > 0) && (
                  <span className="flex flex-wrap items-center gap-1.5 pt-1 text-sm">
                    {r.price !== null && <span>{formatFromPrice(r.price)}</span>}
                    {r.tags.map((t) => (
                      <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <ScoreBadge score={r.score} votes={r.votes} size="lg" layout="stack" />
                <Link
                  href={`/rate?city=${citySlug}&r=${r.slug}&d=${dishSlug}`}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline"
                >
                  Rate this
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
