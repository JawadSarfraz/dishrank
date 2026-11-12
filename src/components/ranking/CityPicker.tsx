// The city switch (spec §4 "City switch"; server component): equal segments in a sand track, the
// current city filled ink. Links, so it works without JavaScript; the current one is
// aria-current="page" (a link, so not aria-pressed).
import Link from "next/link";
import { cn } from "cn";

export function CityPicker({
  cities,
  current,
  className,
}: {
  cities: { slug: string; name: string }[];
  current: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Cities"
      className={cn("grid gap-1 rounded-button bg-sand p-1", className)}
      style={{ gridTemplateColumns: `repeat(${Math.max(cities.length, 1)}, minmax(0, 1fr))` }}
    >
      {cities.map((c) => {
        const active = c.slug === current;
        return (
          <Link
            key={c.slug}
            href={`/${c.slug}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "pressable inline-flex h-11 min-w-0 items-center justify-center rounded-control px-2 text-[15px] transition-colors",
              active ? "bg-ink font-bold text-white" : "font-semibold text-ink hover:bg-white",
            )}
          >
            <span className="truncate">{c.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
