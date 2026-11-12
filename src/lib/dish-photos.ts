// Dish photos (docs/design/adding-photos.md): static files in public/dish-photos, listed in
// config/dish-photos.json with their alt text, credit, source and licence. A dish without an entry
// has no photo and every slot shows the no-photo tile instead (src/lib/dish-look.ts), with no image
// request at all. A photo is always the dish in general, never a given restaurant's plate, so it is
// shown on dish cards and dish pages only (never beside a restaurant). The file is checked when the
// config is read: a malformed list fails the build, and tests/unit/dish/dish-photos.test.ts checks
// that every listed file exists.
import { z } from "zod";
import { SLUG_PATTERN } from "@/lib/slug";
import raw from "../../config/dish-photos.json";

export const DISH_PHOTO_DIR = "/dish-photos";

const entry = z.strictObject({
  /** The dish's slug, as in seed/dishes.json. */
  slug: z.string().regex(SLUG_PATTERN),
  /** The file name inside public/dish-photos: lowercase, .webp, .jpg or .avif. */
  file: z.string().regex(/^[a-z0-9][a-z0-9-]*\.(?:webp|jpe?g|avif)$/),
  /** Alt text: the dish name ("Chicken karahi"). */
  alt: z.string().min(2).max(120),
  /** Who took it, as they want to be credited. */
  credit: z.string().min(2).max(120),
  /** Where it came from (the photographer's page or the licence holder's listing). */
  sourceUrl: z.url(),
  /** The licence in words: "Owner's own", "CC BY 4.0", "Licensed from …". */
  licence: z.string().min(2).max(80),
});

export const dishPhotoList = z
  .array(entry)
  .refine((list) => new Set(list.map((e) => e.slug)).size === list.length, {
    message: "Each dish has at most one photo",
  });

export type DishPhotoEntry = z.infer<typeof entry>;
export type DishPhoto = DishPhotoEntry & { src: string };

/** Parses a photo list (throws on a malformed one) and indexes it by dish slug. */
export function indexDishPhotos(list: unknown): Map<string, DishPhoto> {
  const parsed = dishPhotoList.parse(list);
  return new Map(parsed.map((e) => [e.slug, { ...e, src: `${DISH_PHOTO_DIR}/${e.file}` }]));
}

const PHOTOS = indexDishPhotos(raw);

/** The dish's photo, or null: then every slot shows the no-photo tile. */
export function dishPhoto(slug: string, photos: Map<string, DishPhoto> = PHOTOS): DishPhoto | null {
  return photos.get(slug) ?? null;
}

/** Every listed photo (the data sources page credits them). */
export const allDishPhotos = (): DishPhoto[] => [...PHOTOS.values()];
