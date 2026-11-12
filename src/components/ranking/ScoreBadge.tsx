// A score is never shown without its rater count (docs/01 copy rules); it is the small blush score
// pill (docs/12-DESIGN.md). Server-safe; used on every public page.
import { cn } from "cn";
import { formatScore, formatVotes } from "@/lib/format";
import { SCORE_BAND_CLASS, scoreBand } from "@/lib/score-band";

// The score pill (spec §4): blush, ink 13 px bold, one decimal. Larger sizes for the rate flow.
const SIZES = {
  sm: "h-6 px-2 text-[13px]",
  md: "h-7 px-2.5 text-sm",
  lg: "h-9 px-3 text-lg font-display font-extrabold",
  xl: "h-14 px-4 text-3xl font-display font-extrabold",
} as const;

/** The coloured number alone (its votes must be next to it: use ScoreBadge where possible). */
export function ScorePill({
  score,
  size = "md",
  className,
}: {
  score: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap tabular-nums",
        SIZES[size],
        SCORE_BAND_CLASS[scoreBand(score)],
        className,
      )}
    >
      {formatScore(score)}
    </span>
  );
}

/**
 * Score + votes, in a row (inline), stacked right-aligned (a ranking row's score column), or stacked
 * with the votes large and the score under them (a ranking row in early rankings).
 */
export function ScoreBadge({
  score,
  votes,
  size = "md",
  layout = "inline",
  className,
}: {
  score: number;
  votes: number;
  size?: keyof typeof SIZES;
  layout?: "inline" | "stack" | "votes-first";
  className?: string;
}) {
  if (layout === "votes-first") {
    return (
      <span className={cn("inline-flex flex-col items-end gap-1", className)}>
        <span className="font-display text-lg leading-tight font-bold whitespace-nowrap tabular-nums">
          {formatVotes(votes)}
        </span>
        <span className="sr-only">Score </span>
        <ScorePill score={score} size={size} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        layout === "stack"
          ? "inline-flex flex-col items-end gap-0.5"
          : "inline-flex items-baseline gap-1.5",
        className,
      )}
    >
      <span className="sr-only">Score </span>
      <ScorePill score={score} size={size} />
      <span className="text-xs whitespace-nowrap text-muted-foreground">{formatVotes(votes)}</span>
    </span>
  );
}
