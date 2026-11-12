"use client";

// Dish search on the home and city pages: every spelling in DishAlias, Roman Urdu included
// (karahi / kadai / karhai), through GET /api/v1/dishes. Each result opens its ranking page.
import { ChevronRightIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "cn";
import { DishIcon } from "@/components/brand/DishIcon";
import { SEARCH_ANCHOR } from "@/lib/cities";
import { dishLook } from "@/lib/dish-look";

type Hit = { slug: string; name: string; eligibleCount: number };

export function DishSearch({
  citySlug,
  cityName,
  popover = false,
  anchor = false,
}: {
  citySlug: string;
  cityName: string;
  /** The desktop top bar: results float under the field instead of pushing the page down. */
  popover?: boolean;
  /** The page's own search: the tab bar's Search (`#find-a-dish`) scrolls here and focuses it. */
  anchor?: boolean;
}) {
  const generated = useId();
  const id = anchor ? SEARCH_ANCHOR : generated;
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  // Results remember the query they answer, so a slow, older answer is never shown.
  const [results, setResults] = useState<{ q: string; hits: Hit[] } | null>(null);
  const text = q.trim();
  const hits = text.length >= 2 && results?.q === text ? results.hits : null;

  useEffect(() => {
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/dishes?city=${encodeURIComponent(citySlug)}&q=${encodeURIComponent(text)}`,
          { signal: controller.signal },
        );
        if (res.ok) setResults({ q: text, hits: ((await res.json()).data as Hit[]) ?? [] });
      } catch {
        // Aborted by the next keystroke, or offline: the dish grid still works.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, citySlug]);

  useEffect(() => {
    if (!anchor) return;
    const focus = () => {
      if (window.location.hash === `#${SEARCH_ANCHOR}`) input.current?.focus();
    };
    focus();
    window.addEventListener("hashchange", focus);
    return () => window.removeEventListener("hashchange", focus);
  }, [anchor]);

  return (
    <div className={cn("flex flex-col gap-2", popover && "relative")}>
      <label htmlFor={id} className="sr-only">
        Find a dish in {cityName}
      </label>
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={input}
          id={id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a dish: karahi, kadai, nihari…"
          autoComplete="off"
          enterKeyHint="search"
          className={cn("field scroll-mt-4 pl-11", popover && "h-11 min-h-11")}
        />
      </div>
      {hits && (
        <ul
          aria-live="polite"
          className={cn(
            "flex flex-col divide-y divide-line overflow-hidden rounded-card border bg-card shadow-card",
            popover && "absolute top-full right-0 z-50 mt-2 w-80 shadow-float",
          )}
        >
          {hits.map((hit) => (
            <li key={hit.slug}>
              <Link
                href={`/${citySlug}/best-${hit.slug}`}
                className="flex min-h-14 items-center gap-3 py-2 pr-3 pl-3 transition-colors hover:bg-sand"
              >
                {/* The dish's tile colour with its line icon: the no-photo tile, small. */}
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-chip text-white"
                  style={{ backgroundColor: dishLook(hit.slug).hex }}
                >
                  <DishIcon slug={hit.slug} size={24} />
                </span>
                <span className="min-w-0 flex-1 text-[15px] leading-5 font-bold break-anywhere">
                  {hit.name}
                </span>
                {/* Only the ranked count is known here; with none, a neutral line (never a zero,
                    never "not enough votes" as if the list were empty). */}
                {hit.eligibleCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-blush px-2 py-[3px] text-xs leading-4 font-bold whitespace-nowrap text-brand-dark">
                    {hit.eligibleCount} ranked
                  </span>
                ) : (
                  <span className="shrink-0 text-[13px] leading-[18px] whitespace-nowrap text-muted-foreground">
                    Not ranked yet
                  </span>
                )}
                <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-ink" />
              </Link>
            </li>
          ))}
          {hits.length === 0 && (
            <li className="px-4 py-4 text-sm leading-5 text-muted-foreground">
              No dish matches “{text}”. Try another spelling, or pick one below.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
