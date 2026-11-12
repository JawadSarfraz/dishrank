// Dish photos (docs/design/adding-photos.md): a wrong entry would show a broken image or the wrong
// dish; a missing one must fall back to the no-photo tile everywhere.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../../config/dish-photos.json";
import { dishPhoto, indexDishPhotos } from "@/lib/dish-photos";
import { dishLook } from "@/lib/dish-look";

const karahi = {
  slug: "chicken-karahi",
  file: "chicken-karahi.webp",
  alt: "Chicken karahi",
  credit: "Jawad Sarfraz",
  sourceUrl: "https://kahankhayen.com/about/data",
  licence: "Owner's own",
};

describe("dish photo lookup", () => {
  it("finds a listed dish's photo under /dish-photos and falls back to none for the rest", () => {
    const photos = indexDishPhotos([karahi]);
    expect(dishPhoto("chicken-karahi", photos)).toMatchObject({
      src: "/dish-photos/chicken-karahi.webp",
      alt: "Chicken karahi",
    });
    expect(dishPhoto("haleem", photos)).toBeNull();
    expect(dishPhoto("chicken-karahi", indexDishPhotos([]))).toBeNull();
  });

  it("refuses a malformed list: bad file names, missing credit, two photos for one dish", () => {
    expect(() => indexDishPhotos([{ ...karahi, file: "../secret.webp" }])).toThrow();
    expect(() => indexDishPhotos([{ ...karahi, file: "Karahi.PNG" }])).toThrow();
    expect(() => indexDishPhotos([{ ...karahi, credit: "" }])).toThrow();
    expect(() => indexDishPhotos([karahi, { ...karahi, file: "other.webp" }])).toThrow();
    expect(() => indexDishPhotos({ slug: "x" })).toThrow();
  });

  it("the shipped config parses and every file it lists is in public/dish-photos", () => {
    const photos = indexDishPhotos(config);
    for (const photo of photos.values()) {
      expect(existsSync(path.join("public", photo.src)), photo.src).toBe(true);
    }
  });

  it("every dish has a stable tile look; unknown dishes get the default colour", () => {
    expect(dishLook("chicken-karahi")).toMatchObject({
      tile: "tamatar",
      glyph: { family: "karahi" },
    });
    expect(dishLook("namkeen-gosht")).toMatchObject({
      tile: "masala",
      glyph: { family: "karahi" },
    });
    expect(dishLook("chicken-biryani")).toMatchObject({
      tile: "zafran",
      glyph: { family: "rice" },
    });
    expect(dishLook("chicken-malai-boti")).toMatchObject({ tile: "anaar" });
    expect(dishLook("beef-seekh-kabab")).toMatchObject({ tile: "koyla" });
    expect(dishLook("pizza")).toMatchObject({ tile: "tamatar", glyph: { icon: "pizza" } });
  });
});
