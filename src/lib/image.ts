// Photo preparation in the browser before upload (docs/02 Images): the longest side is cut to
// 1600 px and the image is re-encoded through a canvas, which drops EXIF data, GPS included.

export const PHOTO = { maxSide: 1600, maxBytes: 5 * 1024 * 1024, quality: 0.82 } as const;

/** Width and height scaled down (never up) so the longer side is at most `maxSide`. */
export function fitWithin(width: number, height: number, maxSide: number = PHOTO.maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, PHOTO.quality));
}

/**
 * The photo to upload: ≤ 1600 px, WebP (JPEG where the browser cannot encode WebP), no metadata.
 * Browser only.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (an image file).");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const size = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const webp = await encode(canvas, "image/webp");
  const blob = webp?.type === "image/webp" ? webp : await encode(canvas, "image/jpeg");
  if (!blob) throw new Error("This photo could not be read. Try another one.");
  if (blob.size > PHOTO.maxBytes) throw new Error("This photo is too large even after resizing.");
  return blob;
}
