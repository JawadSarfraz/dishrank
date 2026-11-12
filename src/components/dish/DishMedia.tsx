// A dish's picture in one slot (spec §4 "Photo" and "No-photo tile", §6 "Images"): the photo from
// config/dish-photos.json through next/image when the dish has one, else the flat tile colour with
// its glyph, which needs no image request. Overlays (sticker, count chip, title, buttons) come as
// children and sit on top in both cases; `hasDishPhoto` tells a page which title layout to use.
// Never used beside a restaurant: a dish photo is the dish in general, not that place's plate.
import Image from "next/image";
import { cn } from "cn";
import { dishLook } from "@/lib/dish-look";
import { dishPhoto } from "@/lib/dish-photos";
import { DishGlyph } from "./DishGlyph";

export type DishSlot = "card" | "featured" | "header" | "hero" | "row";

// Few sizes on purpose (Vercel Hobby counts image transformations, next.config.ts).
const SIZES: Record<DishSlot, string> = {
  card: "(min-width: 1024px) 280px, 50vw",
  featured: "100vw",
  header: "100vw",
  hero: "560px",
  row: "64px",
};

/** Glyph placement on the tile, per slot (spec §4, "Where it appears"). */
const GLYPH: Record<
  DishSlot,
  { size: number; stroke: number; opacity: number; className: string }
> = {
  card: {
    size: 76,
    stroke: 3,
    opacity: 0.4,
    className: "absolute -right-2 -bottom-3 lg:size-[110px]",
  },
  featured: { size: 128, stroke: 2.4, opacity: 0.35, className: "absolute -top-3 -right-[18px]" },
  header: { size: 176, stroke: 2.2, opacity: 0.35, className: "absolute top-10 -right-[52px]" },
  hero: {
    size: 220,
    stroke: 2,
    opacity: 1,
    className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  },
  row: {
    size: 40,
    stroke: 3,
    opacity: 1,
    className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  },
};

export const hasDishPhoto = (slug: string) => dishPhoto(slug) !== null;

export function DishMedia({
  slug,
  slot,
  priority = false,
  allowPhoto = true,
  className,
  children,
}: {
  slug: string;
  slot: DishSlot;
  /** The one above-the-fold image of the page (spec §6: exactly one per page). */
  priority?: boolean;
  /** False where a photo could read as a restaurant's own plate: the tile is shown instead. */
  allowPhoto?: boolean;
  /** Sets the box's size and radius. */
  className?: string;
  children?: React.ReactNode;
}) {
  const photo = allowPhoto ? dishPhoto(slug) : null;
  const look = dishLook(slug);
  const glyph = GLYPH[slot];
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={photo ? undefined : { backgroundColor: look.hex }}
    >
      {photo ? (
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={SIZES[slot]}
          quality={70}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          className="object-cover object-center"
        />
      ) : (
        <DishGlyph
          look={look}
          size={glyph.size}
          stroke={glyph.stroke}
          opacity={glyph.opacity}
          className={glyph.className}
        />
      )}
      {children}
    </div>
  );
}
