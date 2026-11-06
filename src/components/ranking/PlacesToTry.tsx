"use client";

// "Places to try": places linked to this dish that nobody has rated yet, so a dish page is useful
// before it ranks anyone. Never a rank and never a score, and in alphabetical order so it cannot read
// as one; the page is static, so the area filter and Near me work on the rows in the browser.
import { MapPinIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { formatKm } from "@/lib/format";
import { haversineKm } from "@/lib/geo";
import type { PlaceToTry } from "@/server/services/ranking.service";
import { useNearMe } from "./use-near-me";

const FIRST = 10;
const MORE = 20;

export function PlacesToTry({
  rows,
  total,
  fromMapData,
  citySlug,
  dishSlug,
}: {
  rows: PlaceToTry[];
  /** Every place here comes from Overture, so the label may say so. */
  fromMapData: boolean;
  /** More places than `rows` carries (the page sends at most PLACES_TO_TRY_LIMIT). */
  total: number;
  citySlug: string;
  dishSlug: string;
}) {
  const [area, setArea] = useState("");
  const [limit, setLimit] = useState(FIRST);
  const { here, locating, locate } = useNearMe();

  const areas = useMemo(() => {
    const bySlug = new Map<string, string>();
    for (const r of rows) if (r.area) bySlug.set(r.area.slug, r.area.name);
    return [...bySlug].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const list = useMemo(() => {
    const filtered = rows
      .filter((r) => !area || r.area?.slug === area)
      .map((r) => ({
        ...r,
        km:
          here && r.lat !== null && r.lng !== null
            ? haversineKm(here, { lat: r.lat, lng: r.lng })
            : null,
      }));
    return here ? filtered.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity)) : filtered;
  }, [rows, area, here]);

  const shown = list.slice(0, limit);
  const left = list.length - shown.length;

  return (
    <section aria-labelledby="places-to-try" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="places-to-try" className="text-xl font-bold">
          Places to try
        </h2>
        <p className="text-sm text-muted-foreground">
          {fromMapData ? "Not ranked yet · from open map data" : "Not ranked yet"}
        </p>
      </div>
      <div role="group" aria-label="Filter places" className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="places-area">
          Area
        </label>
        <select
          id="places-area"
          className="field field-select h-11 w-auto min-w-0 font-medium"
          value={area}
          onChange={(e) => {
            setArea(e.target.value);
            setLimit(FIRST);
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
          size="sm"
          className="h-11 text-base"
          onClick={() => locate(() => setLimit(FIRST))}
          disabled={locating === "busy"}
          aria-pressed={here !== null}
        >
          <MapPinIcon aria-hidden="true" />
          {locating === "busy" ? "Finding you…" : here ? "Near me (on)" : "Near me"}
        </Button>
      </div>
      {locating === "failed" && (
        <p role="alert" className="text-sm text-muted-foreground">
          Your location is not available, so the list stays in A–Z order.
        </p>
      )}

      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed bg-card p-4">
          <p className="font-medium">No place to try in this area yet.</p>
          <Button type="button" variant="secondary" onClick={() => setArea("")}>
            Show all {rows.length}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-card">
          {shown.map((row) => (
            <li key={row.slug} className="flex items-center gap-3 px-3 py-2 sm:px-4">
              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`/${citySlug}/r/${row.slug}`}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center font-display text-lg leading-tight font-bold break-anywhere underline-offset-4 hover:underline"
                >
                  {row.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {[row.area?.name, row.km !== null ? formatKm(row.km) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <ButtonLink
                variant="secondary"
                href={`/rate?city=${citySlug}&r=${row.slug}&d=${dishSlug}`}
                prefetch={false}
                className="shrink-0"
              >
                Rate
              </ButtonLink>
            </li>
          ))}
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
      {left === 0 && total > rows.length && (
        <p className="text-sm text-muted-foreground">
          Showing the first {rows.length} of {total}. Use the search under Rate to find the others.
        </p>
      )}
    </section>
  );
}
