# Adding a dish photo

Every dish starts without a photo and shows its colour tile (the "no-photo tile" in
`docs/12-DESIGN.md`) on the home page, the dish cards, the dish page and the share images. Adding a
photo switches all of those to the photo at once. Nothing else on the page changes.

## The photo

- **Real photos only**: your own, a rater's (with their permission), or licensed stock. No
  AI-generated food photos and no near-match dishes (a mutton karahi is not a chicken karahi).
- **One photo per dish**, of the dish in general. It is never shown next to a restaurant, because
  it is not that restaurant's plate; restaurant pages keep the colour tile.
- **Size**: 1600 × 1200 pixels (4:3), landscape.
- **Framing**: the food centred and filling at least 70% of the frame. The site crops the middle
  of it to 16:9, 7:5, 8:5 and a square, so nothing important may sit near an edge.
- **Format**: WebP at quality 80 (or a good JPEG), under 300 KB. The site serves smaller WebP
  copies itself.
- **File name**: the dish's slug, lowercase, for example `chicken-karahi.webp`. The slugs are in
  `seed/dishes.json`.

## Steps

1. Put the file in `public/dish-photos/`.
2. Add one line to `config/dish-photos.json` (it is a list; the file ships as `[]`):

   ```json
   [
     {
       "slug": "chicken-karahi",
       "file": "chicken-karahi.webp",
       "alt": "Chicken karahi",
       "credit": "Jawad Sarfraz",
       "sourceUrl": "https://kahankhayen.com/about",
       "licence": "Owner's own"
     }
   ]
   ```

   - `alt`: the dish name, as a sentence would say it.
   - `credit`: the photographer, as they want to be named.
   - `sourceUrl`: where the photo came from (their page, the stock listing, or our About page for
     your own).
   - `licence`: in words: "Owner's own", "Used with permission", "CC BY 4.0", "Licensed from …".
3. Run `pnpm test -- dish-photos`: it checks the list and that the file is where the line says.
4. Commit both files. After the deploy, the dish's pages show the photo within the hour (the pages
   refresh every hour), and the data sources page lists the credit.

A malformed list (a bad file name, a missing credit, two photos for one dish) fails the build, so a
mistake never reaches the site.

## Why so few sizes

The site uses `next/image`, and Vercel's Hobby plan has a monthly limit on image transformations.
`next.config.ts` therefore allows one format (WebP), one quality (70) and seven widths, and keeps
each result for a year. Only one image per page loads at once (the top one); the rest load as you
scroll.
