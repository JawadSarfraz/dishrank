// City picker (server component): links, so it works without JavaScript. The current city is the
// filled pill.
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
    <nav aria-label="Cities" className={cn("flex flex-wrap gap-2", className)}>
      {cities.map((c) => {
        const active = c.slug === current;
        return (
          <Link
            key={c.slug}
            href={`/${c.slug}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-base font-medium transition-colors",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {c.name}
          </Link>
        );
      })}
    </nav>
  );
}
