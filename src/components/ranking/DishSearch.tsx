"use client";

// Dish search on the home and city pages: every spelling in DishAlias, Roman Urdu included
// (karahi / kadai / karhai), through GET /api/v1/dishes. Each result opens its ranking page.
import Link from "next/link";
import { useEffect, useState } from "react";

type Hit = { slug: string; name: string; eligibleCount: number };

export function DishSearch({ citySlug, cityName }: { citySlug: string; cityName: string }) {
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

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Find a dish in {cityName}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. karahi, kadai, nihari"
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 rounded-lg border border-input bg-transparent px-3 text-base"
        />
      </label>
      {hits && (
        <ul aria-live="polite" className="flex flex-col divide-y rounded-lg border">
          {hits.map((hit) => (
            <li key={hit.slug}>
              <Link
                href={`/${citySlug}/best-${hit.slug}`}
                className="flex min-h-11 items-center justify-between gap-2 px-3 py-2"
              >
                <span className="font-medium">{hit.name}</span>
                <span className="text-sm text-muted-foreground">
                  {hit.eligibleCount > 0 ? `${hit.eligibleCount} ranked` : "Not enough votes yet"}
                </span>
              </Link>
            </li>
          ))}
          {hits.length === 0 && <li className="px-3 py-2 text-sm">No dish matches “{text}”.</li>}
        </ul>
      )}
    </div>
  );
}
