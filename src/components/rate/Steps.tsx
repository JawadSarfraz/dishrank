import { CheckIcon } from "lucide-react";
import { cn } from "cn";

const STEPS = ["Restaurant", "Dish", "Score"] as const;

/** Where the diner is in the rate flow: done steps tick, the current one is filled. */
export function Steps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Steps" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5",
              state === "current" ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold",
                state === "todo" ? "border border-border bg-card" : "bg-brand text-white",
              )}
            >
              {state === "done" ? <CheckIcon aria-hidden="true" className="size-3" /> : n}
              <span className="sr-only">{state === "done" ? " done" : ""}</span>
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
