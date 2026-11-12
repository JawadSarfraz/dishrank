// How a dish looks without a photo (docs/12-DESIGN.md, "No-photo tile"): a flat tile colour and a
// line glyph, picked from the slug so a dish always looks the same everywhere (spec §2 asks for the
// look to be stored per dish; it is kept here in code instead of a database column, so no
// migration is needed and a new dish gets a sensible default). Shared by the pages and the share
// images, so it holds plain hex values too.
import { dishIconFor, type DishIconName } from "@/components/brand/DishIcon";

export const TILE_COLOURS = {
  tamatar: "#C8371F",
  zafran: "#B4530F",
  masala: "#8B4A1F",
  koyla: "#5C3A2A",
  chai: "#8C5E3C",
  anaar: "#9E2A4B",
} as const;
export type TileColour = keyof typeof TILE_COLOURS;

/** The spec's six glyph families (48 × 48, white stroke). Other dishes use their line icon. */
export type GlyphFamily = "karahi" | "rice" | "bowl" | "skewer" | "patty" | "cup";

export type DishLook = {
  tile: TileColour;
  hex: string;
  /** A spec glyph family, or the dish's own 24 × 24 line icon when no family fits. */
  glyph: { family: GlyphFamily } | { icon: DishIconName };
};

const RULES: [RegExp, TileColour, GlyphFamily][] = [
  [/^namkeen-gosht$/, "masala", "karahi"],
  [/karahi|handi/, "tamatar", "karahi"],
  [/biryani|pulao|mandi/, "zafran", "rice"],
  [/nihari|haleem/, "masala", "bowl"],
  [/seekh/, "koyla", "skewer"],
  [/chapli/, "koyla", "patty"],
  [/tikka|malai-boti/, "anaar", "skewer"],
  [/^chai/, "chai", "cup"],
];

export function dishLook(slug: string): DishLook {
  const rule = RULES.find(([re]) => re.test(slug));
  const tile: TileColour = rule?.[1] ?? "tamatar";
  return {
    tile,
    hex: TILE_COLOURS[tile],
    glyph: rule ? { family: rule[2] } : { icon: dishIconFor(slug) },
  };
}
