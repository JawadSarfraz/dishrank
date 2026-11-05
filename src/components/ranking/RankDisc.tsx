// The rank number in a disc. Gold, silver and bronze for the top three (the only place gold is used
// besides the logo, owner Part 3); every other rank sits on the paper colour.
import { cn } from "cn";

const MEDALS: Record<number, string> = {
  1: "bg-gold text-gold-ink border-gold",
  2: "bg-silver text-foreground border-silver",
  3: "bg-bronze text-foreground border-bronze",
};

export function RankDisc({
  rank,
  size = "md",
  className,
}: {
  rank: number;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-label={`Rank ${rank}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border font-display font-extrabold tabular-nums",
        size === "lg" ? "size-11 text-xl" : "size-9 text-base",
        MEDALS[rank] ?? "border-border bg-background text-foreground",
        className,
      )}
    >
      {rank}
    </span>
  );
}
