import { CheckIcon } from "lucide-react";
import { cn } from "cn";

const STEPS = ["Restaurant", "Dish", "Score"] as const;

/** Where the diner is in the rate flow: done steps tick (ink), the current one is brand. */
export function Steps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol
      aria-label="Steps"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm leading-5"
    >
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5",
              state === "current" ? "font-bold text-ink" : "font-semibold text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full text-xs font-extrabold",
                state === "todo" && "border-[1.5px] border-line-strong bg-card",
                state === "current" && "bg-brand text-white",
                state === "done" && "bg-ink text-white",
              )}
            >
              {state === "done" ? (
                <CheckIcon aria-hidden="true" className="size-3.5" strokeWidth={3} />
              ) : (
                n
              )}
              <span className="sr-only">{state === "done" ? " done" : ""}</span>
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
