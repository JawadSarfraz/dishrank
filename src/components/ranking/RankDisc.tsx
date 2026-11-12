// A rank (spec §4). #1 is a gold circle with an ink numeral, the only place gold appears besides
// the logo's tallest bar. Every other rank is an ink disc with a white numeral (podium badges) or,
// in a list, a plain Display numeral.
import { cn } from "cn";

const SIZES = {
  /** 36 px: a ranking row */
  md: "size-9 text-lg",
  /** 44 px: a restaurant's dish row */
  lg: "size-11 text-xl",
  /** 40 px (#2, #3) or 52 px (#1) on the podium */
  podium: "size-10 text-xl",
} as const;

export function RankDisc({
  rank,
  size = "md",
  plain = false,
  className,
}: {
  rank: number;
  size?: keyof typeof SIZES;
  /** Ranks below 1 as a plain numeral (lists) instead of an ink disc (podium). */
  plain?: boolean;
  className?: string;
}) {
  const first = rank === 1;
  if (plain && !first) {
    return (
      <span
        aria-label={`Rank ${rank}`}
        className={cn(
          "inline-flex shrink-0 items-center justify-center font-display text-[26px] leading-7 font-extrabold tabular-nums",
          size === "lg" && "text-[28px]",
          className,
        )}
      >
        {rank}
      </span>
    );
  }
  return (
    <span
      aria-label={`Rank ${rank}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-extrabold tabular-nums",
        SIZES[size],
        first ? "bg-gold text-ink" : "bg-ink text-white",
        first && size === "md" && "text-xl",
        first && size === "podium" && "size-13 text-[28px]",
        className,
      )}
    >
      {rank}
    </span>
  );
}
