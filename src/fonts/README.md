# Fonts

Both faces are under the SIL Open Font License 1.1; the licence texts with their copyright notices
sit next to the files. Everything is served from this site: nothing on a page, and nothing in a
build, calls Google.

## For the pages (`next/font/local` in `src/app/layout.tsx`)

Variable WOFF2 files, latin subset, copied unchanged from the Fontsource packages (version 5.3.0,
built from google/fonts):

- `bricolage-grotesque-latin-wght-normal.woff2` (41 KB, wght 200–800) from
  `@fontsource-variable/bricolage-grotesque`, Google Fonts v9. © 2022 The Bricolage Grotesque
  Project Authors (github.com/ateliertriay/bricolage); `LICENSE-bricolage-grotesque.txt`.
- `geist-latin-wght-normal.woff2` (29 KB, wght 100–900) from `@fontsource-variable/geist`, Google
  Fonts v5. © 2024 The Geist Project Authors (github.com/vercel/geist-font); `LICENSE-geist.txt`.

They are committed rather than fetched at build time because Turbopack's `next/font/google` loader
fails whenever Google Fonts answers with an extensionless `/l/font?kit=…` URL (vercel/next.js#99114;
it broke the 2026-11-05 deploy), and because a deploy should not depend on a third party's answer.
`next/font` bundles them into `/_next/static/media` with a preload link and a size-adjusted
fallback. To update a face: `npm pack @fontsource-variable/<name>`, copy
`files/<name>-latin-wght-normal.woff2` and `LICENSE` here, and note the version above.

## For the share images (`next/og` in `src/app/opengraph-image.tsx`)

Satori needs TTF, so two static instances are kept as well, both from Google Fonts
(`fonts.gstatic.com`, latin subset):

- `bricolage-grotesque-800.ttf`: Bricolage Grotesque ExtraBold (titles, ranks).
- `geist-500.ttf`: Geist Medium (names, counts).

`next.config.ts` traces `src/fonts/*.ttf` into the two image routes.
