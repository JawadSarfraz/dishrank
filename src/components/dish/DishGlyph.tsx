// The no-photo tile's line glyph (spec §4, "No-photo tile"): the six families drawn on a 48 × 48
// grid in white, round caps and joins; any other dish uses its own 24 × 24 line icon at the same
// size and visual stroke. Server-safe, inline SVG: no image request.
import { DISH_ICON_PATHS } from "@/components/brand/DishIcon";
import type { DishLook, GlyphFamily } from "@/lib/dish-look";

const FAMILIES: Record<GlyphFamily, React.ReactNode> = {
  karahi: (
    <>
      <path d="M3 22h42" />
      <path d="M10 22c0 9 6 15 14 15s14-6 14-15" />
      <path d="M18 15c-1.5-2 1.5-4 0-6M24 15c-1.5-2 1.5-4 0-6M30 15c-1.5-2 1.5-4 0-6" />
    </>
  ),
  rice: (
    <>
      <path d="M5 37h38" />
      <path d="M9 37c0-11 6-18 15-18s15 7 15 18" />
      <path d="M18 28l2 1M26 25l2 1M29 31l2-1M21 33l2-1" />
      <path d="M24 13c-1.5-2 1.5-4 0-6" />
    </>
  ),
  bowl: (
    <>
      <path d="M7 20h34c0 10-7 17-17 17S7 30 7 20z" />
      <path d="M17 42h14" />
      <path d="M18 13c-1.5-2 1.5-4 0-6M24 13c-1.5-2 1.5-4 0-6M30 13c-1.5-2 1.5-4 0-6" />
    </>
  ),
  skewer: (
    <>
      <path d="M6 42 42 6" />
      <rect x="11" y="27" width="10" height="10" rx="2.5" transform="rotate(45 16 32)" />
      <rect x="19" y="19" width="10" height="10" rx="2.5" transform="rotate(45 24 24)" />
      <rect x="27" y="11" width="10" height="10" rx="2.5" transform="rotate(45 32 16)" />
    </>
  ),
  patty: (
    <>
      <ellipse cx="24" cy="27" rx="17" ry="11" />
      <path d="M16 25l2 1M24 22l2 1M30 27l2-1M20 31l2-1M27 32l2-1" />
      <path d="M20 11c-1.5-2 1.5-4 0-6M28 11c-1.5-2 1.5-4 0-6" />
    </>
  ),
  cup: (
    <>
      <path d="M11 18h22v7a11 11 0 0 1-22 0z" />
      <path d="M33 20h3a4.5 4.5 0 0 1 0 9h-3.6" />
      <path d="M8 42h28" />
      <path d="M18 12c-1.5-2 1.5-4 0-6M26 12c-1.5-2 1.5-4 0-6" />
    </>
  ),
};

export function DishGlyph({
  look,
  size,
  stroke,
  opacity = 1,
  className,
  style,
}: {
  look: DishLook;
  size: number;
  /** The stroke on the 48-unit grid (spec values: 2 to 3). */
  stroke: number;
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const family = "family" in look.glyph ? look.glyph.family : null;
  return (
    <svg
      viewBox={family ? "0 0 48 48" : "0 0 24 24"}
      width={size}
      height={size}
      fill="none"
      stroke="#fff"
      strokeWidth={family ? stroke : stroke / 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ opacity, ...style }}
    >
      {family ? (
        FAMILIES[family]
      ) : (
        <path d={DISH_ICON_PATHS["icon" in look.glyph ? look.glyph.icon : "plate"]} />
      )}
    </svg>
  );
}
