# Fonts for the share images

`next/og` (Satori) draws the Open Graph images on the server and needs font files it can read
(TTF, not WOFF2), so these two static instances are kept here:

- `bricolage-grotesque-800.ttf` — Bricolage Grotesque ExtraBold (titles, ranks), SIL Open Font
  License 1.1, © The Bricolage Grotesque Project Authors (github.com/ateliertriay/bricolage).
- `geist-500.ttf` — Geist Medium (names, counts), SIL Open Font License 1.1, © Vercel.

Both came from Google Fonts (`fonts.gstatic.com`, latin subset). The pages themselves load the same
families through `next/font/google`, which self-hosts the WOFF2 files at build time
(`src/app/layout.tsx`); nothing on a page calls Google.
