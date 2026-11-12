// The mark and the wordmark (docs/12-DESIGN.md, Brand). The mark is a karahi seen from above with
// three ranking bars inside, in podium order; the tallest bar is gold. The wordmark is the name in
// two lines: "Kahan Khayen" in Bricolage Grotesque over کہاں کھائیں in Nastaliq, drawn as outlines
// (urdu-name.ts), so no Urdu web font is loaded. Everything is inline SVG and text, so it takes the
// colour of its parent and needs no image request.
import { cn } from "cn";
import { BRAND } from "@/lib/brand";
import { URDU_NAME } from "./urdu-name";

export function LogoMark({
  size = 28,
  className,
  gold = "var(--color-gold)",
}: {
  size?: number;
  className?: string;
  /** The tallest bar's colour (a CSS colour; the share images pass a hex value). */
  gold?: string;
}) {
  return (
    <svg
      viewBox="-0.5 -0.5 33 33"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="3.2" cy="16" r="2.4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="28.8" cy="16" r="2.4" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="9" y="15" width="3.6" height="7" rx="1.2" fill="currentColor" />
      <rect x="14.2" y="10" width="3.6" height="12" rx="1.2" fill={gold} />
      <rect x="19.4" y="17" width="3.6" height="5" rx="1.2" fill="currentColor" />
    </svg>
  );
}

const URDU_SYMBOL_ID = "brand-urdu-name";

/**
 * The Urdu name's outlines, once per page (the root layout renders it first in <body>); every
 * UrduName on the page points at it, so the header and the footer do not repeat the 6 KB path.
 */
export function UrduNameDefs() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute">
      <symbol id={URDU_SYMBOL_ID} viewBox={URDU_NAME.viewBox}>
        <path d={URDU_NAME.d} />
      </symbol>
    </svg>
  );
}

/** The width of the Urdu name at a given height (the outlines keep their aspect ratio). */
export const urduNameWidth = (height: number) =>
  Math.round((height * URDU_NAME.width * 10) / URDU_NAME.height) / 10;

/** کہاں کھائیں as outlined shapes, filled with the parent's text colour; `height` in px. */
export function UrduName({ height, className }: { height: number; className?: string }) {
  return (
    <svg
      width={urduNameWidth(height)}
      height={height}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <use href={`#${URDU_SYMBOL_ID}`} />
    </svg>
  );
}

// Spec §4 (Logo): a 36 px mark (40 on desktop) beside "Kahan Khayen" in Display 800 19 / 22, the
// Urdu name under it at 12 px in muted.
const SIZES = {
  sm: { mark: 30, text: "text-base leading-5", urdu: 11 },
  md: { mark: 36, text: "text-[19px] leading-[22px] lg:text-xl", urdu: 12 },
  lg: { mark: 52, text: "text-3xl", urdu: 20 },
} as const;

/**
 * Mark + name, as one unit: the header, the footer, the sign-in page. Two lines next to the mark:
 * the name in ink, then the Urdu name in muted with an optional small tag ("Beta") after it
 * (docs/12-DESIGN.md, Logo).
 */
export function Wordmark({
  size = "md",
  tag,
  className,
}: {
  size?: keyof typeof SIZES;
  /** A short word shown after the Urdu name, e.g. "Beta". */
  tag?: string;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <LogoMark size={s.mark} className={cn("text-brand", size === "md" && "lg:size-10")} />
      <span className="flex flex-col items-start gap-1">
        <span className={cn("font-display font-extrabold tracking-[-0.01em]", s.text)}>
          {BRAND.name}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <UrduName height={s.urdu} />
          {tag && (
            <span className="rounded-sm bg-blush px-1.5 text-[10px] leading-4 font-bold tracking-wider text-brand-dark uppercase">
              {tag}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}
