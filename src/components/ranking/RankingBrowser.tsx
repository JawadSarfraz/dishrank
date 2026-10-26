"use client";

// The ranked list with its filter bar (docs/08 Phase 4): the page sends every ranked row, and this
// filters and sorts them in the browser. Filters live in the URL (?area=&min=&votes=&sort=) so a
// link keeps them. "Near me" asks for the location only when tapped, never sends it anywhere, and
// puts restaurants without a location last. Ranks are city-wide and never renumbered.
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { haversineKm } from "@/lib/geo";
import { formatKm, formatPrice, formatScore, formatVotes } from "@/lib/format";

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

const select = "h-11 rounded-lg border border-input bg-background px-2 text-base";

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

  const filtered = filters.area !== "" || filters.min > 0 || filters.votes > 0;

  return (
    <div className="flex flex-col gap-3">
      <form
        aria-label="Filter and sort"
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="flex flex-col gap-1 text-sm">
          Area
          <select
            className={select}
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
        <label className="flex flex-col gap-1 text-sm">
          Sort
          <select
            className={select}
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value as Sort })}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Minimum score
          <select
            className={select}
            value={filters.min}
            onChange={(e) => update({ min: Number(e.target.value) })}
          >
            {MIN_SCORES.map((n) => (
              <option key={n} value={n}>
                {n ? `${n}+` : "Any"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Minimum votes
          <select
            className={select}
            value={filters.votes}
            onChange={(e) => update({ votes: Number(e.target.value) })}
          >
            {MIN_VOTES.map((n) => (
              <option key={n} value={n}>
                {n ? `${n}+` : "Any"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={nearMe}
          disabled={locating === "busy"}
          className="col-span-2 min-h-11 rounded-lg border px-3 text-base"
        >
          {locating === "busy" ? "Finding you…" : here ? "Near me (on)" : "Near me"}
        </button>
      </form>
      {locating === "failed" && (
        <p role="alert" className="text-sm">
          Your location is not available, so the list stays in rank order.
        </p>
      )}
      {filters.sort === "distance" && !here && locating !== "busy" && (
        <p className="text-sm text-muted-foreground">Tap “Near me” to sort by distance.</p>
      )}

      {shown.length === 0 ? (
        <p className="text-sm">
          No restaurant matches these filters.{" "}
          {filtered && (
            <button
              type="button"
              className="min-h-11 underline"
              onClick={() => update({ area: "", min: 0, votes: 0 })}
            >
              Show all
            </button>
          )}
        </p>
      ) : (
        <ol aria-label="Ranked restaurants" className="flex flex-col divide-y rounded-lg border">
          {shown.map((r) => (
            <li key={r.slug} className="flex items-start gap-3 px-3 py-2">
              <span
                aria-label={`Rank ${r.rank}`}
                className="mt-2.5 min-w-8 text-center text-lg font-bold tabular-nums"
              >
                {r.rank}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`/${citySlug}/r/${r.slug}`}
                  className="inline-flex min-h-11 items-center font-medium underline-offset-2 hover:underline"
                >
                  {r.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {[r.area?.name, r.km !== null ? formatKm(r.km) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {(r.price !== null || r.tags.length > 0) && (
                  <span className="text-sm">
                    {[r.price !== null ? formatPrice(r.price) : null, ...r.tags]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-md bg-foreground px-2 py-0.5 text-base font-semibold text-background tabular-nums">
                  {formatScore(r.score)}
                </span>
                <span className="text-xs text-muted-foreground">{formatVotes(r.votes)}</span>
                <Link
                  href={`/rate?city=${citySlug}&r=${r.slug}&d=${dishSlug}`}
                  className="inline-flex min-h-11 items-center text-sm font-medium underline"
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
