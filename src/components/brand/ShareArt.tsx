// The share images' building blocks (redesign spec §7), drawn by Satori (next/og) in the dish
// page's link preview (1200 × 630), its WhatsApp status card (1080 × 1920) and the site's default
// image. Satori needs an explicit flex display on every element with more than one child, plain
// hex colours (no CSS variables) and inline SVG for drawings; text never goes under 22 px on a
// link preview. The fonts are named in src/server/services/share-image-assets.ts.
import { DishGlyph } from "@/components/dish/DishGlyph";
import { BRAND } from "@/lib/brand";
import type { DishLook } from "@/lib/dish-look";
import { LogoMark } from "./Logo";
import { URDU_NAME } from "./urdu-name";

/** The spec's tokens as hex values (Satori cannot read the CSS variables). */
export const OG = {
  white: "#FFFFFF",
  ink: "#1B1410",
  muted: "#6B5F58",
  brand: "#D42A19",
  brandDark: "#B32012",
  blush: "#FFF1EC",
  blushStrong: "#FFE4DB",
  gold: "#F5B800",
  seat: "#D9A99F",
  display: "Bricolage Grotesque",
  body: "Figtree",
} as const;

const SHADOW = "0 8px 20px rgba(27,20,16,0.25)";

/** The Urdu name's outlines at a given height (no Urdu font is loaded). */
export function OgUrduName({ height, fill }: { height: number; fill: string }) {
  const width = Math.round((height * URDU_NAME.width) / URDU_NAME.height);
  return (
    <svg viewBox={URDU_NAME.viewBox} width={width} height={height}>
      <path d={URDU_NAME.d} fill={fill} />
    </svg>
  );
}

/** The mark in brand red with the gold bar, the name in ink and the Urdu name in muted, on a row. */
export function OgLogo({
  mark,
  name,
  urdu,
  gap,
}: {
  mark: number;
  name: number;
  urdu: number;
  gap: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      <div style={{ display: "flex", color: OG.brand }}>
        <LogoMark size={mark} gold={OG.gold} />
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: OG.display,
          fontSize: name,
          lineHeight: 1.15,
          letterSpacing: -0.01 * name,
          color: OG.ink,
        }}
      >
        {BRAND.name}
      </div>
      <div style={{ display: "flex", marginTop: Math.round(urdu * 0.15) }}>
        <OgUrduName height={urdu} fill={OG.muted} />
      </div>
    </div>
  );
}

/**
 * "VOTING OPEN": brand red with a white border on a photo; inverted (white, brand-dark text) on a
 * tile, where a red sticker would vanish into the red.
 */
export function OgSticker({
  onTile,
  fontSize,
  rotate,
  style,
}: {
  onTile: boolean;
  fontSize: number;
  rotate: number;
  style: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        transform: `rotate(${rotate}deg)`,
        padding: `${Math.round(fontSize * 0.38)}px ${Math.round(fontSize * 0.7)}px`,
        borderRadius: Math.round(fontSize * 0.58),
        background: onTile ? OG.white : OG.brand,
        border: onTile ? "none" : `${Math.round(fontSize / 7)}px solid ${OG.white}`,
        color: onTile ? OG.brandDark : OG.white,
        fontFamily: OG.display,
        fontSize,
        lineHeight: 1.18,
        letterSpacing: 0.04 * fontSize,
        boxShadow: SHADOW,
        ...style,
      }}
    >
      VOTING OPEN
    </div>
  );
}

/**
 * The dish panel: the photo (cover), or the tile colour with the dish glyph in full white. The
 * children (the sticker, the logo pill) are laid over it.
 */
export function OgDishPanel({
  photo,
  look,
  alt,
  width,
  height,
  glyph,
  style,
  children,
}: {
  photo: string | null;
  width: number;
  height: number;
  look: DishLook;
  alt: string;
  /** Size and placement of the glyph on the tile. */
  glyph: { size: number; style: React.CSSProperties };
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width,
        height,
        flexShrink: 0,
        overflow: "hidden",
        background: look.hex,
        ...style,
      }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img> only
        <img
          src={photo}
          alt={alt}
          width={width}
          height={height}
          style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }}
        />
      ) : (
        <div style={{ display: "flex", position: "absolute", ...glyph.style }}>
          <DishGlyph look={look} size={glyph.size} stroke={2} />
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * The first raters' seats: ticked ink circles for the raters a place already has, the tilted brand
 * "You?" circle, then dashed numbered circles up to the number that ranks a place.
 */
export function OgSeats({
  total,
  filled,
  you,
  seat,
  gap,
}: {
  total: number;
  filled: number;
  /** The "You?" circle: size, border and font size. */
  you: { size: number; border: number; font: number };
  /** The other circles: size, border and numeral size. */
  seat: { size: number; border: number; font: number };
  gap: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      {Array.from({ length: total }, (_, i) =>
        i < filled ? (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: seat.size,
              height: seat.size,
              borderRadius: 999,
              background: OG.ink,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={seat.size * 0.45}
              height={seat.size * 0.45}
              fill="none"
              stroke={OG.white}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
        ) : i === filled ? (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: you.size,
              height: you.size,
              borderRadius: 999,
              border: `${you.border}px solid ${OG.white}`,
              background: OG.brand,
              color: OG.white,
              boxShadow: "0 6px 14px rgba(27,20,16,0.2)",
              transform: "rotate(-6deg)",
              fontFamily: OG.display,
              fontSize: you.font,
            }}
          >
            You?
          </div>
        ) : (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: seat.size,
              height: seat.size,
              borderRadius: 999,
              border: `${seat.border}px dashed ${OG.seat}`,
              color: OG.muted,
              fontFamily: OG.display,
              fontSize: seat.font,
            }}
          >
            {i + 1}
          </div>
        ),
      )}
    </div>
  );
}

/** A title set word by word (Satori has no inline spans), with `highlight` in brand red. */
export function OgTitle({
  text,
  highlight,
  fontSize,
  lineHeight,
  style,
}: {
  text: string;
  highlight: string | null;
  fontSize: number;
  lineHeight: number;
  style?: React.CSSProperties;
}) {
  const at = highlight ? text.indexOf(highlight) : -1;
  const parts =
    highlight && at >= 0
      ? [
          { text: text.slice(0, at), red: false },
          { text: highlight, red: true },
          { text: text.slice(at + highlight.length), red: false },
        ]
      : [{ text, red: false }];
  const words = parts.flatMap((p) =>
    p.text
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ({ w, red: p.red })),
  );
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        columnGap: Math.round(fontSize * 0.24),
        fontFamily: OG.display,
        fontSize,
        lineHeight: `${lineHeight}px`,
        letterSpacing: -0.025 * fontSize,
        color: OG.ink,
        ...style,
      }}
    >
      {words.map(({ w, red }, i) => (
        <span key={i} style={{ color: red ? OG.brand : OG.ink }}>
          {w}
        </span>
      ))}
    </div>
  );
}

/** The call to vote with the site's address: a brand pill, white Display text. */
export function OgVotePill({
  host,
  height,
  fontSize,
  padding,
}: {
  host: string;
  height: number;
  fontSize: number;
  padding: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        alignItems: "center",
        height,
        padding: `0 ${padding}px`,
        borderRadius: 999,
        background: OG.brand,
        color: OG.white,
        fontFamily: OG.display,
        fontSize,
      }}
    >
      {`Vote karein · ${host}`}
    </div>
  );
}

/**
 * A name cut to fit `lines` lines of about `perLine` characters (Satori cannot clamp lines): whole
 * words where they fit, an ellipsis where the name runs over.
 */
export function fitName(name: string, perLine: number, lines: number): string {
  const words = name.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length && out.length < lines) {
    let line = words[i]!.slice(0, perLine);
    const cut = words[i]!.length > perLine;
    i += 1;
    while (!cut && i < words.length && `${line} ${words[i]}`.length <= perLine) {
      line = `${line} ${words[i]}`;
      i += 1;
    }
    out.push(line);
    if (cut) {
      i = words.length + 1; // a word longer than a line: stop here
    }
  }
  if (i === words.length) return out.join(" ");
  // Ran over: end the last line with an ellipsis, dropping its last word if the line is full.
  let last = out.pop() ?? "";
  if (last.length + 1 > perLine && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" "));
  else if (last.length + 1 > perLine) last = last.slice(0, perLine - 1);
  return [...out, `${last.replace(/[\s.,:;·–-]+$/, "")}…`].join(" ");
}

/** Podium order: #2, #1, #3, with an empty slot for a missing place so #1 stays in the middle. */
export function podiumSlots<T extends { rank: number }>(top: T[]): (T | null)[] {
  return [top[1] ?? null, top[0] ?? null, top[2] ?? null];
}
