// The mark and the wordmark (docs/12-DESIGN.md, Brand). The mark is a karahi seen from above with
// three ranking bars inside, in podium order; the tallest bar is gold. Drawn inline, so it takes
// the text colour of its parent and needs no image request.
import { cn } from "cn";
import { BRAND } from "@/lib/brand";

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
      viewBox="0 0 32 32"
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

const SIZES = {
  sm: { mark: 22, text: "text-lg" },
  md: { mark: 26, text: "text-xl" },
  lg: { mark: 40, text: "text-4xl" },
} as const;

/** Mark + name, as one unit: the header, the footer, the sign-in page. */
export function Wordmark({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display font-extrabold tracking-tight text-foreground",
        s.text,
        className,
      )}
    >
      <LogoMark size={s.mark} className="text-brand" />
      <span>{BRAND.name}</span>
    </span>
  );
}
