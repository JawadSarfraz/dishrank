import { cn } from "cn";

/** A static blush block the size of what is loading (spec §3: no shimmer). Admin lists only. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-lg bg-blush", className)}
      {...props}
    />
  );
}

export { Skeleton };
