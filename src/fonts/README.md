# Fonts

All three faces are under the SIL Open Font License 1.1; the licence texts with their copyright notices
sit next to the files. Everything is served from this site: nothing on a page, and nothing in a
build, calls Google.

## For the pages (`next/font/local` in `src/app/layout.tsx`)

Variable WOFF2 files, latin subset, copied unchanged from the Fontsource packages (version 5.3.0,
built from google/fonts):

- `bricolage-grotesque-latin-wght-normal.woff2` (41 KB, wght 200–800) from
  `@fontsource-variable/bricolage-grotesque`, Google Fonts v9. © 2022 The Bricolage Grotesque
  Project Authors (github.com/ateliertriay/bricolage); `LICENSE-bricolage-grotesque.txt`.
- `figtree-latin-wght-normal.woff2` (20 KB, wght 300–900) from `@fontsource-variable/figtree`
  5.3.0. © 2022 The Figtree Project Authors (github.com/erikdkennedy/figtree);
  `LICENSE-figtree.txt`. The body face since the "Garma Garam" redesign (2026-11); it replaced
  Geist.

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

## For the Urdu name in the logo (`src/components/brand/urdu-name.ts`)

No Urdu font is served. کہاں کھائیں is committed as one SVG path, made once from Noto Nastaliq Urdu
(the variable TTF in google/fonts, `ofl/notonastaliqurdu`; © 2022 The Noto Project Authors,
github.com/notofonts/nastaliq; `LICENSE-noto-nastaliq-urdu.txt`) at weight 700, shaped by HarfBuzz
and flattened glyph by glyph. To make it again (a new name or weight), in a scratch folder:

```bash
npm pack harfbuzzjs@0.4.12 && tar xzf harfbuzzjs-0.4.12.tgz          # hb.wasm + hbjs.js wrapper
curl -LO "https://github.com/google/fonts/raw/main/ofl/notonastaliqurdu/NotoNastaliqUrdu%5Bwght%5D.ttf"
```

then, in Node: `hb.createFace(hb.createBlob(ttf), 0)`, `font.setVariations({ wght: 700 })`,
`font.setScale(upem, upem)`, a buffer with `addText("کہاں کھائیں")`, `setDirection("rtl")`,
`setScript("Arab")`, `setLanguage("ur")`, `hb.shape(font, buffer)`; for each glyph of
`buffer.json()` (visual order, left to right) take `font.glyphToPath(g.g)`, add the pen position and
`dx`/`dy` to every coordinate, flip y, and advance the pen by `ax`. Measure the ink box of the joined
path (`getBBox()` in a browser), move it to 0,0, scale it to a height of 1000 and round to whole units;
that is `URDU_NAME.d`, with the width in `viewBox`.
