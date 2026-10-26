// The launch-dish grid of a city (server component): each dish links to its ranking page and shows
// how many restaurants rank and the one ranked first.
import Link from "next/link";
import { formatScore, formatVotes } from "@/lib/format";
import type { CityOverview } from "@/server/services/city-page.service";

export function CityDishGrid({ overview }: { overview: CityOverview }) {
  const { city, dishes } = overview;
  return (
    <ul className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
      {dishes.map((d) => (
        <li key={d.slug}>
          <Link
            href={`/${city.slug}/best-${d.slug}`}
            className="flex min-h-11 flex-col gap-0.5 rounded-lg border px-3 py-2 active:bg-muted"
          >
            <span className="font-medium">{d.name}</span>
            <span className="text-sm text-muted-foreground">
              {d.top
                ? `1. ${d.top.name} · ${formatScore(d.top.score)} · ${formatVotes(d.top.votes)}`
                : "Not enough votes yet"}
            </span>
            {d.ranked > 1 && (
              <span className="text-xs text-muted-foreground">{d.ranked} restaurants ranked</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
