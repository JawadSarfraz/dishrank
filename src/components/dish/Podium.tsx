// The top three on a ranked dish page (spec §4, Podium): visual order 2, 1, 3, DOM order 1, 2, 3
// (screen readers and keyboards meet #1 first). Each column links to the restaurant page: rank
// badge, name, area, then a block with the rater count large and the score small. With one or two
// ranked places only those columns show, centred. Gold is for rank 1 only.
import Link from "next/link";
import { cn } from "cn";
import { RankDisc } from "@/components/ranking/RankDisc";
import { formatScore } from "@/lib/format";

export type PodiumPlace = {
  rank: number;
  href: string;
  name: string;
  area: string | null;
  votes: number;
  score: number;
};

// By position on the podium (the first three rows in rank order).
const ORDER = ["order-2", "order-1", "order-3"];
const BLOCK = ["h-33", "h-26", "h-22"];

export function Podium({ places }: { places: PodiumPlace[] }) {
  const top = places.slice(0, 3);
  return (
    <ol
      aria-label={top.length === 3 ? "Top three" : "Top ranked"}
      className={cn(
        "grid items-end gap-2",
        top.length === 3 ? "grid-cols-3" : "mx-auto w-full grid-cols-2",
        top.length === 1 && "max-w-[33%] grid-cols-1",
        top.length === 2 && "max-w-[67%]",
      )}
    >
      {top.map((p, i) => {
        const first = p.rank === 1;
        return (
          <li key={p.href} className={cn("flex min-w-0", ORDER[i])}>
            <Link
              href={p.href}
              className="group flex min-w-0 flex-1 flex-col items-center text-ink"
            >
              <RankDisc rank={p.rank} size="podium" className={cn(first && "shadow-sticker")} />
              <span className="mt-2 text-center text-sm leading-[18px] font-bold break-anywhere underline-offset-2 group-hover:underline">
                {p.name}
              </span>
              {p.area && (
                <span className="mt-0.5 text-center text-xs text-muted-foreground">{p.area}</span>
              )}
              <span
                className={cn(
                  "mt-2 flex w-full flex-col items-center justify-center rounded-t-button",
                  BLOCK[i],
                  first ? "bg-gold-tint" : "bg-blush",
                )}
              >
                <span
                  className={cn(
                    "font-display font-extrabold tabular-nums",
                    first ? "text-[34px] leading-9" : "text-[28px] leading-[30px]",
                  )}
                >
                  {p.votes}
                </span>
                <span className="text-xs font-semibold">{p.votes === 1 ? "rater" : "raters"}</span>
                <span className="mt-1 text-[13px] leading-[18px] font-medium">
                  Score {formatScore(p.score)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
