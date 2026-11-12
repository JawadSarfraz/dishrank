"use client";

// "Contenders" (docs/01 D2a): the places on a dish's list that nobody has rated yet, so a dish page
// is useful before it ranks anyone. Never a rank and never a score; the order is shuffled on the
// server at each render of the page, so no place collects votes just for being on top. The page is
// static, so the area filter and Near me work on the rows in the browser. The list ends with the
// way to nominate a place ("Missing one? Add it.").
//
// Two looks (spec §5): on a voting-open page, "Contenders" with every row and the filters; on a
// ranked page, "Still need votes": the places with raters but no rank first (with their progress),
// then the contenders, the first three only until "Show all N places", which also brings the
// filters.
import { MapPinIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CONTROL_BUTTON,
  CONTROL_SELECT,
  ListHeader,
  PlaceRow,
  rateHrefOf,
  stillNeeds,
} from "@/components/dish/PlaceRow";
import { Button } from "@/components/ui/button";
import { AddRow, RowList } from "@/components/ui/kit";
import { formatKm } from "@/lib/format";
import { haversineKm } from "@/lib/geo";
import { suggestPlacePath } from "@/lib/paths";
import type { Contender } from "@/server/services/ranking.service";
import { useNearMe } from "./use-near-me";

const FIRST = 10;
const MORE = 20;
/** Ranked pages: rows shown before "Show all N places" (spec §5). */
const PREVIEW = 3;

/** A place with raters but no rank yet (ranked pages: they lead the list). */
export type WaitingPlace = Contender & { id: string; votes: number; ranksNext: boolean };

type Item = Contender & { key: string; waiting: { votes: number; ranksNext: boolean } | null };

const placesLabel = (n: number) => `${n} place${n === 1 ? "" : "s"}`;

export function Contenders({
  rows,
  total,
  citySlug,
  dishSlug,
  minRaters,
  waiting = [],
  variant = "open",
}: {
  rows: Contender[];
  /** More places than `rows` carries (the page sends at most CONTENDERS_LIMIT). */
  total: number;
  citySlug: string;
  dishSlug: string;
  minRaters: number;
  /** Ranked pages: the places collecting votes, shown before the contenders. */
  waiting?: WaitingPlace[];
  variant?: "open" | "ranked";
}) {
  const ranked = variant === "ranked";
  const [area, setArea] = useState("");
  const [limit, setLimit] = useState(ranked ? PREVIEW : FIRST);
  const { here, locating, locate } = useNearMe();

  const items = useMemo<Item[]>(
    () => [
      ...waiting.map((w) => ({
        ...w,
        key: w.id,
        waiting: { votes: w.votes, ranksNext: w.ranksNext },
      })),
      ...rows.map((r) => ({ ...r, key: r.slug, waiting: null })),
    ],
    [rows, waiting],
  );

  const areas = useMemo(() => {
    const bySlug = new Map<string, string>();
    for (const r of items) if (r.area) bySlug.set(r.area.slug, r.area.name);
    return [...bySlug].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const list = useMemo(() => {
    const filtered = items
      .filter((r) => !area || r.area?.slug === area)
      .map((r) => ({
        ...r,
        km:
          here && r.lat !== null && r.lng !== null
            ? haversineKm(here, { lat: r.lat, lng: r.lng })
            : null,
      }));
    return here ? filtered.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity)) : filtered;
  }, [items, area, here]);

  // Ranked pages show the filters once the whole list is open (the first three need none).
  const expanded = !ranked || limit > PREVIEW;
  const shown = list.slice(0, limit);
  const left = list.length - shown.length;
  const everyPlace = waiting.length + total;

  const detailOf = (r: (typeof list)[number]) => {
    const progress = r.waiting
      ? stillNeeds(r.waiting.votes, minRaters, r.waiting.ranksNext)
      : ranked
        ? "be the first to rate"
        : null;
    return [r.area?.name, r.km !== null ? formatKm(r.km) : null, progress]
      .filter(Boolean)
      .join(" · ");
  };

  const headingId = ranked ? "still-need-votes" : "contenders";
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      {ranked ? (
        <ListHeader
          id={headingId}
          size="sub"
          title="Still need votes"
          count={placesLabel(everyPlace)}
          note={`A place joins the ranking after ${minRaters} diners rate it.`}
        />
      ) : (
        <ListHeader
          id={headingId}
          title="Contenders"
          count={placesLabel(total)}
          // Shuffled on purpose (see above): never "A to Z".
          note="Not ranked yet, in random order."
        />
      )}

      {expanded && (
        <div role="group" aria-label="Filter places" className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`${headingId}-area`}>
            Area
          </label>
          <select
            id={`${headingId}-area`}
            className={`${CONTROL_SELECT} flex-1`}
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              if (!ranked) setLimit(FIRST);
            }}
          >
            <option value="">All areas</option>
            {areas.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            className={CONTROL_BUTTON}
            onClick={() =>
              locate(() => {
                if (!ranked) setLimit(FIRST);
              })
            }
            disabled={locating === "busy"}
            aria-pressed={here !== null}
          >
            <MapPinIcon aria-hidden="true" className="size-[18px]" />
            {locating === "busy" ? "Finding you…" : here ? "Near me (on)" : "Near me"}
          </Button>
        </div>
      )}
      {locating === "failed" && (
        <p role="alert" className="text-sm text-muted-foreground">
          Your location is not available, so the list stays as it is.
        </p>
      )}

      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-dash bg-card p-4">
          <p className="font-semibold">
            {ranked ? "No place in this area yet." : "No contender in this area yet."}
          </p>
          <Button type="button" variant="outline" onClick={() => setArea("")}>
            Show all {items.length}
          </Button>
        </div>
      ) : (
        <RowList>
          {shown.map((r) => (
            <PlaceRow
              key={r.key}
              href={`/${citySlug}/r/${r.slug}`}
              rateHref={rateHrefOf(citySlug, r.slug, dishSlug)}
              name={r.name}
              detail={detailOf(r)}
            />
          ))}
          {left > 0 && (
            <li className="flex">
              <button
                type="button"
                className="min-h-13 flex-1 bg-card px-4 text-[15px] font-bold text-ink hover:bg-sand"
                onClick={() => setLimit((n) => (ranked && n === PREVIEW ? Infinity : n + MORE))}
              >
                {ranked && limit === PREVIEW
                  ? `Show all ${placesLabel(list.length)}`
                  : `Show more (${left} left)`}
              </button>
            </li>
          )}
        </RowList>
      )}

      {left === 0 && total > rows.length && (
        <p className="text-sm text-muted-foreground">
          Showing the first {rows.length} of {total}. Use the search under Rate to find the others.
        </p>
      )}

      <AddRow href={suggestPlacePath(citySlug)} />
    </section>
  );
}
