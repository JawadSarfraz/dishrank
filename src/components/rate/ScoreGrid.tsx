// The score row's ten buttons (spec §4, Score row): two rows of five, 44 px high, radius 12, a
// 1.5 px line-strong border; the chosen one fills brand with the cta shadow. Shared by "Rate the
// places you know" and the rate flow's score step, so a score looks the same everywhere.
import { cn } from "cn";

const SCORES = Array.from({ length: 10 }, (_, i) => i + 1);

/** One score button's look; also used for the rate flow's 1-to-5 detail scores. */
export const scoreButton =
  "h-11 min-w-0 rounded-control border-[1.5px] border-line-strong bg-card text-base font-bold text-ink transition-[background-color,border-color,color,box-shadow] duration-150 ease-out hover:border-ink aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white aria-pressed:shadow-cta motion-reduce:transition-none";

export function ScoreGrid({
  value,
  label,
  buttonLabel,
  busy = false,
  onPick,
}: {
  /** The score shown as chosen (saved, or on its way). */
  value: number | null;
  /** The group's name for screen readers, e.g. "Your score for Butt Karahi, 1 to 10". */
  label: string;
  /** Each button's name, e.g. "8 out of 10 for Butt Karahi". */
  buttonLabel: (n: number) => string;
  /** A save is on its way: taps wait, the chosen score keeps its full colour. */
  busy?: boolean;
  onPick: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div
        role="group"
        aria-label={label}
        aria-busy={busy || undefined}
        className="grid grid-cols-5 gap-2"
      >
        {SCORES.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={buttonLabel(n)}
            onClick={() => {
              if (!busy) onPick(n);
            }}
            className={cn(scoreButton, busy && "cursor-progress")}
          >
            {n}
          </button>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="flex justify-between gap-3 text-xs leading-4 text-muted-foreground"
      >
        <span>1 = bad</span>
        <span>10 = best I&apos;ve had</span>
      </div>
    </div>
  );
}
