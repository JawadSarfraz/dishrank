// The files the share images read at request time (next.config.ts traces them into the image
// routes): the fonts in src/fonts, and a dish's photo from public/dish-photos when
// config/dish-photos.json lists one. Satori reads TTF and WOFF (not WOFF2), and draws JPEG and WebP
// photos (not AVIF: an AVIF photo leaves the image on the no-photo tile).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dishPhoto } from "@/lib/dish-photos";

const fontFile = (file: string) =>
  readFile(path.join(process.cwd(), "src", "fonts", file)).then((buf) =>
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );

/** The display face's name in the images' styles. */
export const OG_DISPLAY = "Bricolage Grotesque";
/** The body face's name in the images' styles. */
export const OG_BODY = "Figtree";

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700 | 800; style: "normal" };

let fonts: Promise<OgFont[]> | null = null;

/** Bricolage Grotesque 800 for titles and numerals; Figtree 400, 600 and 700 for the rest. */
export function shareImageFonts(): Promise<OgFont[]> {
  fonts ??= Promise.all([
    fontFile("bricolage-grotesque-800.ttf"),
    fontFile("figtree-400.woff"),
    fontFile("figtree-600.woff"),
    fontFile("figtree-700.woff"),
  ]).then(([display, body400, body600, body700]) => [
    { name: OG_DISPLAY, data: display, weight: 800, style: "normal" },
    { name: OG_BODY, data: body400, weight: 400, style: "normal" },
    { name: OG_BODY, data: body600, weight: 600, style: "normal" },
    { name: OG_BODY, data: body700, weight: 700, style: "normal" },
  ]);
  fonts.catch(() => (fonts = null)); // a failed read is retried on the next request
  return fonts;
}

const PHOTO_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** The dish's photo as a data URI for Satori, or null (no photo, an AVIF, or a missing file). */
export async function dishPhotoDataUri(slug: string): Promise<string | null> {
  const photo = dishPhoto(slug);
  const type = photo ? PHOTO_TYPES[path.extname(photo.file)] : undefined;
  if (!photo || !type) return null;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "dish-photos", photo.file));
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null; // the unit test checks every listed file exists; fall back to the tile anyway
  }
}
