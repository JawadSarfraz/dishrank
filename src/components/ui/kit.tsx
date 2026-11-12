// Small shared pieces of the "Garma Garam" design (docs/12-DESIGN.md, spec §4). Server-safe: no
// hooks, no client code. Pages compose these instead of repeating their classes.
import { CheckIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

/** "Voting open" (spec §4, Sticker). One per screen at most; `onTile` inverts it on a colour tile. */
export function Sticker({
  children = "Voting open",
  onTile = false,
  className,
}: {
  children?: React.ReactNode;
  onTile?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block w-fit -rotate-4 rounded-chip font-display text-[13px] leading-4 font-extrabold tracking-[0.04em] uppercase shadow-sticker",
        onTile
          ? "bg-white px-3 py-2 text-brand-dark"
          : "border-2 border-white bg-brand px-2.5 py-1.5 text-white",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** "14 places", "3 ranked": a pill on a photo (ink) or on a colour tile (white). */
export function CountChip({
  children,
  onTile = false,
  className,
}: {
  children: React.ReactNode;
  onTile?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-[3px] text-xs leading-4 font-bold whitespace-nowrap",
        onTile ? "bg-white text-ink" : "bg-ink text-white",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The 20 px gold "1" in front of the #1 place's name (a dish card's status line). */
export function NumberOneChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-gold text-xs leading-none font-extrabold text-ink",
        className,
      )}
    >
      <span className="sr-only">Number </span>1
    </span>
  );
}

/** The 8 px brand dot and "Voting open" in brand-dark: a dish card's status line. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full bg-brand", className)} />
  );
}

/** One bordered list (spec §4: contender and ranking rows): radius 20, card shadow, 1 px dividers. */
export function RowList({
  ordered = false,
  className,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, "ref"> & { ordered?: boolean }) {
  const classes = cn(
    "flex flex-col divide-y divide-line overflow-hidden rounded-card border bg-card shadow-card",
    className,
  );
  return ordered ? (
    <ol className={classes} {...props}>
      {children}
    </ol>
  ) : (
    <ul className={classes} {...props}>
      {children}
    </ul>
  );
}

/** "Missing one? Add it.": the dashed add row under a list (spec §4, Add row). */
export function AddRow({
  href,
  children = "Missing one? Add it.",
  className,
}: {
  href: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        "pressable flex min-h-14 items-center justify-center gap-2 rounded-button border-[1.5px] border-dashed border-dash bg-card px-4 text-[15px] font-semibold text-ink hover:bg-sand",
        className,
      )}
    >
      <PlusIcon aria-hidden="true" className="size-5" />
      {children}
    </Link>
  );
}

/**
 * The "first four" seats (spec §4): `total` circles. Filled seats (earlier raters) are ink circles
 * with a white tick; the visitor's seat is the tilted brand circle ("You?" before they rate, "You"
 * after); the rest are dashed and numbered. Decorative: the sentence next to it carries the meaning.
 */
export function Seats({
  total,
  filled = 0,
  you = "invite",
  size = "md",
  className,
}: {
  total: number;
  /** Seats already taken by other raters. */
  filled?: number;
  /** "invite": the next seat asks "You?"; "taken": the visitor's own seat says "You"; "none". */
  you?: "invite" | "taken" | "none";
  size?: "md" | "sm";
  className?: string;
}) {
  const seats = Array.from({ length: Math.max(total, 1) }, (_, i) => i);
  const youAt = you === "none" ? -1 : Math.min(filled, total - 1);
  const big = size === "md" ? "size-13" : "size-11";
  const small = size === "md" ? "size-12" : "size-10";
  return (
    <div aria-hidden="true" className={cn("flex items-center gap-2.5", className)}>
      {seats.map((i) =>
        i < filled && i !== youAt ? (
          <span
            key={i}
            className={cn("flex items-center justify-center rounded-full bg-ink text-white", small)}
          >
            <CheckIcon className="size-5" strokeWidth={3} />
          </span>
        ) : i === youAt ? (
          <span
            key={i}
            className={cn(
              "flex -rotate-6 items-center justify-center rounded-full border-2 border-white bg-brand font-display text-sm font-extrabold text-white shadow-sticker",
              big,
            )}
          >
            {you === "taken" ? "You" : "You?"}
          </span>
        ) : (
          <span
            key={i}
            className={cn(
              "flex items-center justify-center rounded-full border-2 border-dashed border-seat font-display text-lg font-extrabold text-muted-foreground",
              small,
            )}
          >
            {i + 1}
          </span>
        ),
      )}
    </div>
  );
}

/** The honest small print under lists and pages (13 / 18, muted). */
export function SmallPrint({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-[13px] leading-[18px] text-muted-foreground", className)} {...props} />
  );
}

/** A link inside small print or body text: ink, 600, underlined. */
export function InlineLink({ className, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "font-semibold text-ink underline underline-offset-2 hover:text-brand-press",
        className,
      )}
      {...props}
    />
  );
}
