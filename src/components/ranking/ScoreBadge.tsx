// A score is never shown without its vote count (docs/01 copy rules), and its colour follows the
// score band (src/lib/score-band.ts). Server-safe; used on every public page.
import { cn } from "cn";
import { formatScore, formatVotes } from "@/lib/format";
import { SCORE_BAND_CLASS, scoreBand } from "@/lib/score-band";

const SIZES = {
  sm: "h-6 min-w-9 px-1.5 text-sm",
  md: "h-8 min-w-11 px-2 text-base",
  lg: "h-10 min-w-14 px-2.5 text-xl",
  xl: "h-14 min-w-20 px-3 text-3xl",
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
        "inline-flex items-center justify-center rounded-md font-display font-bold tabular-nums",
        SIZES[size],
        SCORE_BAND_CLASS[scoreBand(score)],
        className,
      )}
    >
      {formatScore(score)}
    </span>
  );
}

/** Score + votes, in a row (inline) or stacked right-aligned (a ranking row's score column). */
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
  layout?: "inline" | "stack";
  className?: string;
}) {
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
