# 12 — Design

The look of Kahan Khayen since the redesign of 2026-11-13: **"Garma Garam"**. White ground, chilli
red brand colour, warm ink text, a food photo or a colour tile on every dish, a phone tab bar, rank
and rater count big and the score small, gold only for rank 1. One light theme.

- **The handoff** lives in `docs/design/redesign-2026-11/`: `redesign-spec.md` (tokens, components,
  pages, images, share images), `html/` (one static reference file per screen; `round-1-not-used/`
  is not to be built), `screens/` (PNG exports) and `README.md`. The spec's numbers are sample data.
- **Where the build differs from the spec, and why**: `docs/OPEN-QUESTIONS.md`, entry 2026-11-13.
  This file describes what is built; when it and the spec disagree, the code and this file win.
- **Dish photos** follow `docs/design/adding-photos.md`.
- **Where it lives**: tokens in `src/app/globals.css`, fonts in `src/app/fonts.ts`, the name in
  `src/lib/brand.ts`, the parts in `src/components/ui/*`, `src/components/brand/*`,
  `src/components/dish/*`, `src/components/home/*`, `src/components/ranking/*`,
  `src/components/rate/*`, `src/components/restaurant/*` and `src/components/layout/*`.

## Brand

- **Name in one place.** The product is Kahan Khayen (Urdu کہاں کھائیں, "where should we eat?";
  renamed from DishRank on 2026-11-06). `src/lib/brand.ts` exports `BRAND` (name, Urdu name, short
  name, tagline, English tagline, share call, description, theme and background colours). Pages,
  the share images, the manifest and the header read it; the root layout's title template appends
  it (`%s · Kahan Khayen`). Internal names (the repo, the database, the package, env vars, cookie
  and cache prefixes) stay `dishrank`. Changing the name again is a one-line change plus new Urdu
  outlines (`src/fonts/README.md`), a new Google OAuth consent-screen name and, if the mark
  changes, `pnpm icons:build` (the icons carry no text).
- **Tagline.** "Har dish ka pehla number" (Roman Urdu, "the number one for every dish"), always
  with its English line "Restaurants ranked dish by dish, by people who ate there." Home cards
  section title on phones, the desktop hero, the footer, the default share image.
- **Wordmark** (`Wordmark` in `src/components/brand/Logo.tsx`). The mark in `brand`, then two
  lines: "Kahan Khayen" in Bricolage Grotesque 800, tracking −0.01 em, in ink, over کہاں کھائیں in
  `muted`. Sizes: `sm` mark 30 px, name 16 px, Urdu 11 px high (footer); `md` mark 36 px, name
  19 / 22 px (20 px from 1024 px), Urdu 12 px (header); `lg` mark 52 px, name 30 px, Urdu 20 px
  (sign-in). In beta mode a "Beta" tag (blush pill, `brand-dark` 10 px uppercase) follows the Urdu
  name on the second line.
- **Urdu name.** Noto Nastaliq Urdu Bold shaped by HarfBuzz and flattened to one SVG path
  (`src/components/brand/urdu-name.ts`, OFL 1.1), defined once per page as an SVG symbol by the root
  layout (`UrduNameDefs`) and referenced by every `UrduName`. Never an Urdu web font. The share
  images draw the same outlines (`OgUrduName`).
- **Mark** (`LogoMark`). A karahi seen from above (the rim and its two ring handles) with three
  bars inside in podium order; the tallest, middle bar is gold (the only gold outside rank 1). Drawn
  inline, so it takes the parent's colour. Original work; no stock art anywhere.
- **App icons and manifest colours.** `pnpm icons:build` (`scripts/make-icons.ts`) draws the mark
  in white with the gold bar on a brand-red tile for `src/app/icon.svg`, the favicon, the apple
  icon and the PNG icons; `BRAND.themeColor` is brand red `#D42A19` and `BRAND.backgroundColor`
  white (the installed app's browser chrome and splash screen).

### Voice and truthful copy

- Short, plain words. Ratings are opinions, never facts about a restaurant (CLAUDE.md rule 9); no
  claim about hygiene, adulteration or health anywhere.
- **A score never shows without its rater count.** Rank and rater count are big, the score is small
  ("Score 8.4", or the score pill beside "12 raters").
- **Never render a count of zero.** When a number would be zero, the invitation shows instead: "Be
  one of the first four to rate. You decide the first ranking.", "We're picking the contenders.",
  "Be the first to rate it here". The status badge says "New list · 4+ votes rank a place" (the live
  threshold), never "0 of 4".
- **Signed-in diner, not "real person".** The trust block says "Every rating is given on Kahan
  Khayen by a signed-in diner. Nothing paid, copied or generated." Sign-in cannot prove more.
- **Contenders are "in random order"**, never "listed A to Z": the server shuffles them at each
  render so no place gains from being first.
- **"Counts right away" only when the rating counted.** A held rating says "Under review" / "It is
  waiting for a check before it counts", a hidden one "Not counted", a stale one "Saved" / "The list
  updates in a moment".
- **No relative dates on cached pages.** An ISR page cannot say "Updated 3 days ago"; the ranking
  header says "Scores out of 10". Absolute dates are fine ("Voting closes Sun 20 Dec").
- **Roman-Urdu lines only where they read right.** "Aap ki karahi ka number kya hai?" shows on the
  home's featured card only for dishes whose word is feminine (karahi, biryani, nihari, chai;
  `src/components/home/featured-copy.ts`). The share images pick "ki" or "ke" per dish and fall back
  to "Aap ke hisaab se number 1 kaun hai?" (`dishLine` in `src/server/services/share-image.ts`).
  The button names the dish itself: "Vote for your chicken karahi".
- **"Pehla vote aap ka?" only when nobody has rated.** With raters it becomes "2 of 4 raters so far
  for the first ranked …" on the page and "Agla vote aap ka?" on the share images.
- The 1–10 rows carry two anchors, "1 = bad" and "10 = best I've had". Rate mode and the rate flow
  say "Sirf wahan rate karein jahan khaya ho." ("rate only where you ate").
- **Share text.** The dish page's share ends with `BRAND.shareCall` ("Aap ki rai? Jo 3 jagah try ki
  hain, unhein rate karein:") and the link after it, tagged `s=share`.

## Tokens (Tailwind 4 theme, `src/app/globals.css`)

CSS variables on `:root`, mapped to Tailwind colours in `@theme inline`. No `tailwind.config.ts`.
There is no dark theme.

### Colour

| Token                         | Hex       | Tailwind                                                 | Use                                                                    |
| ----------------------------- | --------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `--background`, `--card`      | `#FFFFFF` | `bg-background`, `bg-card`                               | page ground, cards                                                     |
| `--ink` (= `--foreground`)    | `#1B1410` | `text-ink`, `bg-ink`, `text-foreground`                  | text, active city, trust block, #2/#3 podium discs, focus ring         |
| `--muted-foreground`          | `#6B5F58` | `text-muted-foreground`                                  | secondary text, inactive tab icons, the Urdu name                      |
| `--brand` (= `--primary`)     | `#D42A19` | `bg-brand`, `text-brand`, `bg-primary`                   | Primary button, selected score, live dot, sticker, the mark            |
| `--brand-dark`                | `#B32012` | `text-brand-dark`, `bg-brand-dark`                       | red text on blush; Primary hover                                       |
| `--brand-press`               | `#8F190E` | `bg-brand-press`, `hover:text-brand-press`               | Primary pressed; link hover                                            |
| `--blush` (= `--secondary`)   | `#FFF1EC` | `bg-blush`, `bg-secondary`                               | tint surfaces: featured card, badges, Rate pill, score pill, seats     |
| `--blush-strong`              | `#FFE4DB` | `bg-blush-strong`                                        | Rate pill hover, text selection, #2/#3 blocks on the status card       |
| `--sand` (= `--muted`)        | `#F6EFEA` | `bg-sand`, `bg-muted`, `bg-accent`                       | city switch track, hover fills                                         |
| `--line` (= `--border`)       | `#EFE5DE` | `border` (default), `border-line`, `divide-line`         | card borders, dividers                                                 |
| `--line-strong` (= `--input`) | `#D8C9BF` | `border-input`, `border-line-strong`                     | field and score-button borders                                         |
| `--dash`                      | `#B9A397` | `border-dash`                                            | dashed Add row and EmptyState border                                   |
| `--seat`                      | `#D9A99F` | `border-seat`                                            | empty "first four" seats                                               |
| `--trust-text`                | `#E9DED6` | `text-trust-text`                                        | lines on the ink trust block                                           |
| `--gold`                      | `#F5B800` | `bg-gold`                                                | rank 1 only: the disc, the "1" chip, share-image #1 block; logo bar    |
| `--gold-tint`                 | `#FFF4CC` | `bg-gold-tint`                                           | rank 1 only: the #1 podium block on the site                           |
| `--gold-text`                 | `#6E5200` | `text-gold-text`                                         | defined, unused                                                        |
| `--success`                   | `#1F7A4D` | `bg-success`                                             | the success tick only                                                  |
| `--destructive`               | `#B42318` | `bg-destructive`, `text-destructive`                     | delete, errors                                                         |
| `--ring`                      | ink       | `outline-ring`                                           | focus                                                                  |

Older names stay as aliases so the admin and owner pages pick up the palette: `brand-ink` =
`brand-dark`, `brand-soft` = `blush`, `gold-soft` = `gold-tint`, `gold-ink` = `ink`. New code uses
the new names.

**No-photo tile colours** (`--color-tile-*`, also as hex in `TILE_COLOURS`, `src/lib/dish-look.ts`):

| Token          | Hex       | Dishes                                         |
| -------------- | --------- | ---------------------------------------------- |
| `tile-tamatar` | `#C8371F` | karahi and handi dishes; default for any other |
| `tile-zafran`  | `#B4530F` | biryani, pulao, mandi                          |
| `tile-masala`  | `#8B4A1F` | nihari, haleem, namkeen gosht                  |
| `tile-koyla`   | `#5C3A2A` | seekh kabab, chapli kabab                      |
| `tile-chai`    | `#8C5E3C` | chai                                           |
| `tile-anaar`   | `#9E2A4B` | tikka, malai boti                              |

Rules:

- **Gold only for rank 1** (and the logo's tallest bar). #2 and #3 are ink discs or plain numerals;
  there is no silver or bronze.
- Red text on blush is `brand-dark`. `brand` on blush only at 24 px bold or larger (the restaurant
  name in its 28 px H1).
- `muted` text never on anything darker than `blush-strong`.
- Score pills are the same for every score (`SCORE_BAND_CLASS` in `src/lib/score-band.ts`: blush,
  ink text). The bands keep only their words ("Excellent"); there are no score colours.

WCAG contrast (AA: 4.5:1 for text, 3:1 for large text), computed from the hex values on 2026-11-13:

| Pair                                                       | Ratio            |
| ---------------------------------------------------------- | ---------------- |
| ink on white / blush / sand                                | 18.2 / 16.5 / 16 |
| muted on white / blush / blush-strong / sand               | 6.2 / 5.6 / 5.1 / 5.4 |
| white on brand (Primary) / brand-dark / brand-press        | 5.1 / 6.7 / 9.1  |
| brand on white (links, red words in titles)                | 5.1              |
| brand-dark on blush (badges, Rate pill)                    | 6.1              |
| brand on blush (24 px bold and up only)                    | 4.6              |
| ink on gold (rank 1) / gold-tint                           | 10.2 / 16.5      |
| white and trust-text on ink (trust block)                  | 18.2 / 13.8      |
| white on success / destructive; destructive on white       | 5.3 / 6.6; 6.6   |
| white on tamatar / zafran / masala / koyla / chai / anaar  | 5.2 / 5.0 / 6.8 / 10.0 / 5.6 / 7.3 |

### Type

Two faces, both SIL Open Font License 1.1, committed in `src/fonts/` and loaded with
`next/font/local` (`src/app/fonts.ts`, used by the root layout and `global-error.tsx`). **Never
`next/font/google`**: fetching at build time fails at random (vercel/next.js#99114) and broke the
2026-11-05 deploy; the spec's `next/font/google` is overruled (OPEN-QUESTIONS 2026-11-13). The
files are variable WOFF2, latin subset (Bricolage Grotesque about 41 KB, Figtree about 20 KB);
provenance and licences in `src/fonts/README.md`. `display: "fallback"` with an Arial-metrics
fallback: the fallback paints at once and the real face swaps in only within about three seconds,
so a slow first load never reflows late. Geist is gone.

| Role                        | Face                | CSS variable       | Weights used | Where                                                         |
| --------------------------- | ------------------- | ------------------ | ------------ | ------------------------------------------------------------- |
| Display (`font-display`)    | Bricolage Grotesque | `--font-bricolage` | 700, 800     | h1–h3 (800 by default), card titles, numerals, sticker, seats |
| Body (`font-sans`, default) | Figtree             | `--font-figtree`   | 400–700      | everything else; 600 for chips and labels, 700 for buttons    |

**Share images** cannot read WOFF2 (Satori): they load `bricolage-grotesque-800.ttf` and
`figtree-400.woff`, `figtree-600.woff`, `figtree-700.woff` from `src/fonts/` through
`shareImageFonts()` in `src/server/services/share-image-assets.ts`.

Scale (phone; Tailwind classes as used):

| Role                       | Size / line            | Weight     | Class                                                                         | Desktop                                       |
| -------------------------- | ---------------------- | ---------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| Page title (dish H1)       | 32 / 34                | 800        | `text-[32px] leading-[34px] tracking-[-0.02em]` (`PageHeader`, `DishHeader`)  | Prose h1 40 / 44                              |
| Hero title                 | 28 / 30                | 800        | `text-[28px] leading-[30px] tracking-[-0.015em]`                              | home 60 / 62; restaurant and sign-in 34 / 38  |
| Section title              | 24 / 28                | 800        | `text-2xl leading-7` (`SectionHeader`)                                        | 32 / 36                                       |
| Sub-section title          | 20 / 24                | 800        | `text-xl leading-6`                                                           |                                               |
| Tile title                 | 20 / 22                | 800        | `text-xl leading-[22px]`                                                      | 24 / 26                                       |
| Card title                 | 17 / 20                | 700        | `text-[17px] leading-5` (`CardTitle`)                                         | 20 / 24                                       |
| Rank numeral (list)        | 26 / 28                | 800        | `RankDisc plain`                                                              |                                               |
| Rater count (list)         | 22 / 24                | 800        | `text-[22px] leading-6`                                                       |                                               |
| Your score (success)       | 56 / 56                | 800        | `text-[56px] leading-[56px]`                                                  |                                               |
| Body large                 | 16 / 23                | 400        | `text-base leading-[23px]`                                                    | 16 / 24                                       |
| Row title                  | 16 / 22                | 700        | `text-base leading-[22px] font-bold`                                          |                                               |
| Body                       | 15 / 20                | 400–700    | `text-[15px] leading-5`                                                       |                                               |
| Body small                 | 14 / 20                | 400        | `text-sm leading-5`                                                           |                                               |
| Caption, small print       | 13 / 18                | 400        | `text-[13px] leading-[18px]` (`SmallPrint`)                                   |                                               |
| Chip, tab label            | 12 / 16                | 600–700    | `text-xs`                                                                     |                                               |

The body is 16 px / 1.5. A text field is never under 16 px, so iOS never zooms on focus (the
spec draws some search fields at 15 px; the build keeps 16 px). h1–h3 get `text-wrap: balance` and −0.01 em by default; paragraphs
`text-wrap: pretty`.

### Space, radius, shadow, motion

- **Spacing** on the 4 px grid. Page gutter 16 px on phones, 24 px from 640 px (`Main` in
  `src/components/layout/Page.tsx`); sections 28 px apart (`gap-7`). Page widths: `narrow`
  `max-w-xl` (576 px: sign-in, /me, trust pages, the rate flow), `default` `max-w-3xl` (768 px:
  dish and restaurant pages), `wide` `max-w-5xl` (1024 px: admin and owner tables), `full`
  1240 px with 32 px gutters from 1024 px (home and city pages, header, footer).
- **Radius** (`--radius` is 16 px). Named steps, and Tailwind's scale set to the same values:

| Step     | px  | Class                          | Use                                                     |
| -------- | --- | ------------------------------ | ------------------------------------------------------- |
| chip     | 10  | `rounded-chip`                 | sticker, small chips                                    |
| control  | 12  | `rounded-control`, `rounded-md` | score buttons, city segments, list selects             |
| field    | 14  | `rounded-field`, `rounded-lg`  | fields, Outline buttons, 64 px dish tiles              |
| button   | 16  | `rounded-button`               | Primary buttons, Add row, city track, podium block tops |
| card     | 20  | `rounded-card`, `rounded-xl`   | cards, lists, EmptyState                               |
| block    | 24  | `rounded-block`, `rounded-2xl` | tint blocks: featured card, trust block, success card  |
| sheet    | 28  | `rounded-sheet`, `rounded-3xl` | dish-page sheet top, restaurant header bottom, hero tile |
| (full)   | 999 | `rounded-full`                 | pills, round buttons, discs                             |

`rounded-sm` is 8 px and `rounded-4xl` 32 px.

- **Shadows**: `shadow-card` (cards and lists), `shadow-card-hover` (dish and restaurant cards on
  hover), `shadow-float` (round buttons on photos and tiles), `shadow-cta` (the dish-page Primary,
  the selected score), `shadow-sticker` (sticker, "You?" seat, #1 podium disc), `shadow-raised`
  (menus, the install card), `shadow-sheet` (the bottom sheet). No glows.
- **Motion**: press is 120 ms ease-out, scale 0.98 (`pressable`, and built into `Button`; the round
  button 0.96); a score select is 150 ms; the bottom sheet and the install card slide in over
  300 ms. Nothing loops. `prefers-reduced-motion: reduce` collapses every animation and transition
  (global rule). No animation library.
- **Focus**: a 2 px ink outline, 2 px offset, on every interactive element (`:focus-visible`);
  white on the ink trust block.
- **Loading**: static blush blocks in the final layout (`RateSkeleton` in
  `src/components/rate/RateSkeleton.tsx`, `Skeleton` in `src/components/ui/skeleton.tsx`). **No
  shimmer.** The public pages have no `loading.tsx` (2026-11-11): with one, the cached HTML started
  with the skeleton and the footer, and a fetcher without JavaScript saw no `<h1>`. The `<h1>` and
  the main content are in the first HTML, in order.

### Utilities and hooks (`globals.css`)

| Name                           | What it does                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `field`                        | a native input, select or textarea: 48 px, `rounded-field`, 1.5 px `line-strong` border, 16 px text, white; border turns ink on focus |
| `field-select`                 | adds the ink chevron to a native `<select>`                                                        |
| `pressable`                    | 120 ms transitions and scale 0.98 on `:active` for links that act like buttons (cards, chips, Add row) |
| `break-anywhere`               | long names wrap instead of widening a row at 360 px (never truncate a name)                        |
| `pb-tabbar`                    | bottom padding of `--tabbar-height` (68 px plus the safe-area inset) below 1024 px; on `<body>`     |
| `--tabbar-height`              | the tab bar's height; toasts, the install card and the repeat Rate bar sit above it                |
| `[data-tabbar]`                | marks the tab bar                                                                                  |
| `body[data-rate-mode]`         | set while rate mode is open: hides the tab bar and every `[data-rate-hide]` part of the dish page  |
| `[data-rate-hide]`             | the dish page's header, sheet top, lists and small print, hidden in rate mode                      |
| `body[data-keyboard]`          | set on touch screens while a text field has focus: hides the tab bar while the keyboard is up      |

## Components

| Component | File | Notes |
| --- | --- | --- |
| Button | `components/ui/button.tsx` | Variants: `default` (Primary: brand, white bold, `rounded-button`; hover `brand-dark`, pressed `brand-press`; disabled `line` fill and muted text), `cta` (Primary with `shadow-cta`, dish pages), `outline` (white, 1.5 px ink border, `rounded-field`, hover sand), `pill` (the Rate pill: blush, `brand-dark`, fully round), `secondary` (blush), `ghost`, `round` (44 px white circle; add `shadow-float` on photos), `destructive`, `link` (ink, underlined, 44 px tap height). Sizes: `default` 48 px, `lg` 52 px, `xl` 56 px (17 px text), `pill` 44 px, `icon` 44 px; `sm` 40 px, `xs` 32 px, `icon-sm` 40 px and `icon-xs` 32 px for dense admin rows only. |
| ButtonLink | `components/ui/button-link.tsx` | A link that looks like a button is a real `<a>`, same variants and sizes. |
| Badge | `components/ui/badge.tsx` | `default` is the status badge: blush pill, `brand-dark` 13 px bold, with `dot` for the 8 px brand dot ("New list · 4+ votes rank a place", "Early ranking · 7 of 14 places ranked"). `secondary`, `outline`, `destructive`, `gold` are small admin labels (`gold` unused). Never a score. |
| Kit | `components/ui/kit.tsx` | Server-safe small parts. `Sticker` ("Voting open": brand, white Display 800 13 px uppercase, −4°, white border; `onTile` inverts it to white with `brand-dark` text; one per screen). `CountChip` ("14 places", "3 ranked": ink on photos, white on tiles). `NumberOneChip` (20 px gold "1"). `LiveDot`. `RowList` (one bordered list: `rounded-card`, `shadow-card`, 1 px dividers; `ordered` for an `<ol>`). `AddRow` ("Missing one? Add it.": 56 px, dashed `dash` border). `Seats` (the "first four": earlier raters as ink circles with a tick, the visitor's seat as a tilted 52 px brand circle "You?" / "You", the rest dashed `seat` circles numbered; decorative, the sentence beside it carries the meaning). `SmallPrint`. `InlineLink` (ink, 600, underlined). |
| Card | `components/ui/card.tsx` | White, 1 px line border, `rounded-card`, `shadow-card`. |
| EmptyState | `components/ui/empty-state.tsx` | Dashed `dash` card: an icon in a blush disc, a one-line Display title, one sentence, **one** action (optionally a quieter Outline second way). Every empty list has one. |
| RankDisc | `components/ranking/RankDisc.tsx` | Rank 1: gold circle, ink numeral (36 px in a list, 44 px on a restaurant row, 52 px on the podium). Others: ink disc with a white numeral (40 px, podium) or, with `plain`, a Display 800 26 px numeral (28 px on restaurant rows). `aria-label="Rank n"`. |
| ScorePill, ScoreBadge | `components/ranking/ScoreBadge.tsx` | `ScorePill`: blush pill, ink bold, one decimal ("8.4"); sizes `sm` 24 px, `md` 28 px, `lg`, `xl`. Public rows set it beside the rater count. `ScoreBadge` pairs it with the vote count in one element (owner pages). |
| DishMedia | `components/dish/DishMedia.tsx` | A dish's picture in one slot (`card`, `featured`, `header`, `hero`, `row`): the photo through `next/image` (quality 70, `sizes` per slot, lazy unless `priority`) or the no-photo tile (flat tile colour plus the glyph placed per slot), which needs no image request. Overlays come as children. `allowPhoto={false}` beside a restaurant (restaurant rows, My ratings): a dish photo is the dish in general, never that place's plate. `hasDishPhoto(slug)` picks the title layout. |
| DishGlyph | `components/dish/DishGlyph.tsx` | The six 48 × 48 white line glyphs (karahi, rice, bowl, skewer, patty, cup); any other dish uses its 24 × 24 `DishIcon` at the same size. Card 76 px stroke 3 at 40 %; featured 128 px 2.4 at 35 %; header 176 px 2.2 at 35 %; hero 220 px 2 full white; row 40 px 3 full white. |
| dish-look | `lib/dish-look.ts` | `dishLook(slug)`: tile colour and glyph family from the slug (rules in code, not a database column; OPEN-QUESTIONS 2026-11-13). Shared by pages and share images. |
| dish-photos | `lib/dish-photos.ts`, `config/dish-photos.json`, `public/dish-photos/` | The photo list (ships `[]`): slug, file, alt, credit, source, licence, checked by Zod at build; `tests/unit/dish/dish-photos.test.ts` checks every file exists. Credits on `/about/data`. How to add one: `docs/design/adding-photos.md`. |
| DishIcon | `components/brand/DishIcon.tsx` | Thirteen original 24 × 24 line icons by dish family (karahi, rice, platter, bowl, skewer, patty, puri, burger, pizza, drumstick, wrap, cup, plate). Rate-flow chips, search results, empty states. |
| SiteHeader | `components/layout/SiteHeader.tsx` | See Navigation. Client-side session read, so public pages stay static. |
| TabBar | `components/layout/TabBar.tsx` | See Navigation. |
| Footer | `components/layout/Footer.tsx` | Wordmark `sm`, the tagline and its English line, six links (How rankings work, Dispute a listing, About, Data sources, Privacy, Terms; dispute is rule 9), and "Scores are diners' opinions, not facts about a restaurant. Something wrong? Tell us." |
| Main, PageHeader, SectionHeader | `components/layout/Page.tsx` | The page column (widths above); a title block (eyebrow, 32 / 34 h1, lede, actions); a section title with an aside link. |
| Prose | `components/layout/Prose.tsx` | Reading pages: Display h1 32 / 34 (40 / 44 from 1024 px), h2 24 / 28, h3 20 / 24, body 16 / 24 ink, links ink bold underlined, list items with a small brand dot. |
| InkBlock | `components/trust/InkBlock.tsx` | The trust block's look (ink, `rounded-block`, `trust-text` lines) for trust summaries on reading pages. |
| ProblemPage | `components/layout/ProblemPage.tsx` | 404 (`app/not-found.tsx`), error (`app/error.tsx`), Forbidden (`components/auth/Forbidden.tsx`), Offline (`app/(public)/offline/page.tsx`), global error (`app/global-error.tsx`): a 72 px `tile-tamatar` tile tilted −4° with a white icon, the hero title, one line, one or two actions (Primary, then Outline), centred. `global-error.tsx` carries the fonts and styles itself. |
| ShareButton | `components/ranking/ShareButton.tsx` | Web Share, else copy the link (`fallback="copy"`) or open `wa.me` with the text (`fallback="whatsapp"`). Looks: a full-width button (any of `outline`, `secondary`, `default`, `cta`) or `appearance="round"` (44 px circle on a header). With `statusImage`, a link under it: "Get the WhatsApp status image". Counts a `share_click` when it names a dish. |
| Sheet | `components/ui/sheet.tsx` | Base UI dialog from the bottom, `shadow-sheet`: the ranking's Filters. |
| Disclosure | `components/ui/disclosure.tsx` | A native `<details>` as a card: report a problem, claim, add details, delete account. |
| Toasts | `components/ui/toast.tsx` | Base UI; above the tab bar on phones. |
| Steps | `components/rate/Steps.tsx` | Restaurant → Dish → Score: current step a brand disc, done ink with a tick, to-do outlined. |
| ScoreGrid | `components/rate/ScoreGrid.tsx` | Ten 44 px buttons in a 5-column grid (two rows), `rounded-control`, 1.5 px `line-strong` border, ink 16 px bold; hover border ink; selected (`aria-pressed`) brand fill, white, `shadow-cta`. "1 = bad" and "10 = best I've had" under it. Shared by rate mode and the rate flow, so a score looks the same everywhere. |
| Home | `components/home/CityHome.tsx`, `components/home/featured-copy.ts`, `components/ranking/FeaturedDishes.tsx` (`FeaturedVote`, `ComingNext`), `CityDishGrid.tsx`, `CityPicker.tsx`, `DishSearch.tsx`, `TrustBox.tsx` | See Screens. |
| Dish page | `components/dish/DishHeader.tsx` (`DishHeader`, `DishTitle`), `Podium.tsx`, `PlaceRow.tsx` (`PlaceRow`, `ListHeader`, `stillNeeds`, `CONTROL_SELECT`, `CONTROL_BUTTON`), `components/ranking/RankingBrowser.tsx`, `Contenders.tsx`, `WaitingList.tsx`, `QuickRate.tsx`, `QuickRatePanel.tsx` | See Screens. List controls are 44 px (`rounded-control`, 1.5 px `line-strong`). |
| Rate flow | `components/rate/RateFlow.tsx` | Single-rating flow and the success screen. |
| Restaurant | `components/restaurant/RestaurantDishRows.tsx` (`RankedDishRows`, `UnrankedDishRows`) | See Screens. |
| Share art | `components/brand/ShareArt.tsx` | The share images' parts in hex (`OG`): `OgLogo`, `OgUrduName`, `OgSticker`, `OgDishPanel`, `OgSeats`, `OgTitle`, `OgVotePill`, `fitName`, `podiumSlots`. |
| Admin shell | `app/admin/layout.tsx`, `components/admin/AdminNav.tsx`, `AdminPage.tsx` | See Admin. |

## Navigation

- **Phones (below 1024 px), header**: 64 px, not sticky, below the top safe area: the wordmark
  (home link) and "How it works" (to `/how-rankings-work`). Nothing else: Rate, Search and the
  account live in the tab bar.
- **Phones, tab bar** (`TabBar`): fixed to the bottom, white, 1 px line top border, four equal
  54 px links (24 px icon over a 12 px label), bottom padding 8 px plus the home-indicator inset,
  side padding at least the side insets. `<body>` carries `pb-tabbar` so nothing hides under it.
  - **Home**: `/`. Active on `/` and on the city page.
  - **Search**: the current city's page at `#find-a-dish` (`SEARCH_ANCHOR`, `src/lib/cities.ts`),
    which scrolls to the dish search and focuses it. There is no search page. Never shown active.
  - **Rate**: a white star in a 48 × 32 brand pill, label ink 700, always emphasised; `/rate` (with
    `?city=` outside Islamabad).
  - **Me**: signed in, `/me` (My ratings); signed out, `/sign-in?callbackUrl=%2Fme`. Active on both.
    My ratings carries the account: Owner area (OWNER), Admin (ADMIN), Sign out, Delete my account.
  - Active tab: brand icon and label, 700; others muted, 600.
  - The bar steps aside in rate mode (`body[data-rate-mode]`) and while the keyboard is up
    (`body[data-keyboard]`).
- **Desktop (1024 px up), top bar**: one row, max 1240 px, 72 px, 1 px line bottom border:
  wordmark; "Dishes" (`/<city>#dishes`) and "How rankings work" from 1280 px only; then, right
  aligned, the city switch (40 px segments in a sand track), the dish search (180 px, 210 px from
  1280 px; loaded only on a desktop screen, results in a popover), Primary "Rate a dish" with a
  star (hidden on `/rate`), and "Sign in" (hidden on `/sign-in` and `/join/*`) or the account menu
  (a 44 px round initial opening My ratings, Owner for OWNER, Admin for ADMIN, Sign out). No tab
  bar. The role only picks which links show; every page checks it again.
- **Rate mode** (dish page, "Rate the places you know"): a full-screen dialog over the page
  (`QuickRate`), with a round Back button, "Chicken Karahi · Islamabad", and its own `h2` styled as
  the title. It sets `body[data-rate-mode]`; Back, the phone's back button and Escape leave it. Once
  a place is rated, the **Done bar** is fixed to the bottom in place of the tab bar: "2 places
  rated" over "Saved as you tap", and Primary "Done" (52 px).
- **Repeat bar**: on a dish page, when "Rate the places you know" has scrolled out of view, it
  comes back as a bar fixed above the tab bar (at the bottom from 1024 px), and steps aside when
  the footer is in view.
- **Safe areas**: the viewport is `viewport-fit=cover`; the header pads the top inset, the tab bar,
  the Done bar and the repeat bar pad the bottom inset.

## Screens

### Home and city pages (`CityHome`, ISR)

Phones, top to bottom:

1. **City switch** (`CityPicker`): equal 44 px links in a sand track (`rounded-button`, padding
   4), the current city filled ink with white 700 text (`aria-current="page"`).
2. **Dish search** (`DishSearch`, anchor `#find-a-dish`): 48 px field, 20 px search icon,
   placeholder "Find a dish: karahi, kadai, nihari…"; every spelling in `DishAlias` (Roman Urdu
   included); each result opens its dish page.
3. **Featured vote card** (`FeaturedVote`, the city's first featured dish; set on
   /admin/rankings): blush block, `rounded-block`. With a photo: the 184 px photo with the sticker,
   then the H1 "Where's the best _chicken karahi_ in Islamabad?" (dish name in brand). Without (the
   usual case): the tile (min 196 px) carries the inverted sticker and the white H1. Then the
   Roman-Urdu line where it fits, the #1 place ("1" chip, name, "· 3 ranked") when one ranks, the
   Primary "Vote for your chicken karahi →" (52 px) and the closing line with a clock ("Voting for
   the winter results closes Sun 20 Dec") until that day has passed. With no contenders it asks
   "Tell us which places should be on the list" instead and shows no sticker.
4. **"Har dish ka pehla number"** with the English line, then the **dish cards** (`CityDishGrid`):
   the second featured dish first (OPEN-QUESTIONS 2026-11-13: the design shows one featured card),
   then every dish with a place on its list; 2 columns, 3 from 640 px, gap 12. The home shows six
   on phones and an Outline "See all 19 dishes" to the city page's `#dishes`; the city page shows
   them all and, in early rankings, the badge "New lists · 4+ votes rank a place".
5. **Coming next** (`ComingNext`): the dishes with no contenders as 44 px chips with a small tile
   and glyph, and "Tell us which places should be on the list".
6. **Trust block** (`TrustBox`): ink, `rounded-block`, padding 20: "Why these ranks can be trusted",
   three lines with white icons in `trust-text` (signed-in diner; "A place ranks once at least 4
   different people have rated the dish there." with the live threshold; "Rankings are never for
   sale."), and "How rankings work".
7. Footer (with the small print), tab bar.

**Dish card** (whole card a link, `rounded-card`, `shadow-card`, `pressable`, hover
`shadow-card-hover`): with a photo, a 112 px photo (176 px from 1024 px) with an ink count chip, then
the title (card title); without, the tile with the title in white on it and a white count chip.
Body: voting open, the live dot and "Voting open" in `brand-dark`, then "Rate one you know →",
chip "N places"; ranked, the "1" chip and the #1 place's name, then "See the ranking →", chip
"N ranked". A dish with nothing listed is never a card (it is in Coming next), so no chip says 0.

**Desktop**: city switch and search move to the top bar. The featured vote becomes a two-column hero
(text left: sticker, 60 / 62 H1, the Roman-Urdu line, the 56 px Primary with `shadow-cta`, the
closing line, the tagline; right: the 400 px photo or tile, `rounded-sheet`, glyph 220 px full
white, with an "N places in the running" chip). Cards sit under "Dishes in Islamabad" with "See all
19 dishes →", in `repeat(auto-fit, minmax(250px, 1fr))`, gap 24, at most eight on the home. The
trust block spreads its three lines in columns. When a city has no featured dish, a plain header
takes the hero's place ("Where's the best chicken karahi in Islamabad?" on `/`, "Best food in
Rawalpindi, dish by dish" on a city page).

### Dish page `/[city]/best-[dish]` (ISR)

- **Header** (`DishHeader`). Without a photo: a band in the tile colour (glyph 176 px) with the
  round Back and Share buttons, the white breadcrumb "Islamabad › Chicken Karahi" and the white
  32 / 34 H1 "Best Chicken Karahi in Islamabad" (max 270 px). With a photo: the 232 px photo
  (`priority`) carries only the buttons; breadcrumb and H1 move into the sheet (`DishTitle`).
- **Sheet**: white, `rounded-t-sheet`, overlapping the header by 28 px, padding 20 / 16. The
  status badge, and the featured round's closing line in `brand-dark` when there is one.
- **Voting open** (nothing ranked): "Be one of the first four to rate. You decide the first
  ranking." while nobody has rated, else the summary ("2 restaurants collecting votes · A place joins the ranking once at least 4 diners have
  rated it."). The seats block (blush, `rounded-card`): the seats while the threshold is
  5 or fewer, then "**Pehla vote aap ka?** A place joins the ranking once at least 4 diners have rated it." only
  when nobody has rated; otherwise "2 of 4 raters so far for the first ranked Chicken Karahi in
  Islamabad." (or "A few more ratings for…" when only weight is short).
- **Ranked**: "Ranked by people who ate there." and the **podium** (`Podium`): DOM order 1, 2, 3,
  visual order 2, 1, 3; each column a link to the restaurant: the rank disc (#1 gold 52 px with
  `shadow-sticker`, #2 and #3 ink 40 px), name, area, then a block with a 16 px rounded top (#1
  132 px `gold-tint`, #2 104 px and #3 88 px blush) holding the rater count (34 px for #1, 28 px
  for the others), "raters" and "Score 8.4". One or two ranked places show only those columns,
  centred.
- **"Rate the places you know"**: Primary `cta`, 56 px, star icon, full width; helper "One tap per
  place, 1 to 10. Sirf wahan rate karein jahan khaya ho." Opens rate mode.
- **Lists.** Ranked: "Full ranking" + "7 ranked", note "Scores out of 10", the filter bar (Filters
  opens the bottom sheet with area, minimum score and minimum votes; a sort select; "Near me" asks
  for the location only when tapped; filters stay in the URL), then the ranking rows
  (`RankingBrowser`): grid `36px 1fr 44px 40px`, min 68 px, each a link to the restaurant: rank,
  name over area · distance · "from Rs 1,900" and variant chips, rater count (22 px) over
  "raters", score pill. Then **"Still need votes"** + "N places", "A place joins the ranking once
  at least 4 diners have rated it.": the places with raters first ("G-13 · 2 more raters and it ranks"), then the
  contenders ("be the first to rate"), three rows until "Show all N places" (which brings the area
  select and Near me). Voting open: the waiting list (when places have raters), then
  **"Contenders"** + "14 places", "Not ranked yet, in random order.", the area select and Near me
  (44 px), ten rows then "Show more". Contender rows (`PlaceRow`): name (links to the restaurant)
  over area, Rate pill into the rate flow at the score step; min 68 px; names wrap. Each list ends
  with the Add row. No places at all: an EmptyState "We're picking the contenders" with "Tell us"
  and "Rate Chicken Karahi somewhere".
- **Small print**: "A place gets a rank for this dish once 4 different people have rated it there.
  [Recent votes count more.] [While Islamabad is new, fewer votes are needed.] Scores are diners'
  opinions, not facts about a restaurant. How rankings work". Then the Share button ("Share this
  ranking" / "Share this list") with "Get the WhatsApp status image" under it.
- **Link preview** (title, description, image): while nothing ranks, "Vote: who makes the best
  Chicken Karahi in Islamabad?" and "… A place joins the ranking once at least 4 diners have rated it."; the page is `noindex`
  until three places rank (`src/lib/indexing.ts`).

### Rate mode and success

- **Rate mode** (`QuickRate`, `QuickRatePanel`; the list and its code load only when opened, in
  the page's shuffled order). "One tap saves your score, 1 to 10. **Sirf wahan rate karein jahan
  khaya ho.**" (signed out: "Tap your score, 1 to 10. You sign in once, and your score stays.");
  "Find a place in Islamabad" (48 px search field); score rows; Outline "Show all 14 places"; "Not
  listed for Chicken Karahi yet" (search hits elsewhere: the rating adds the dish there); the Add
  row; the Done bar.
- **Score row**: a white card (`rounded-card`, `shadow-card`): name as an `h2` and area, the
  `ScoreGrid`, the anchors. A tap saves at once (POST `/api/v1/ratings`, the same service as the
  rate flow). Selected: the card border turns 1.5 px brand. Saved: a blush bar (min 44 px, tick)
  with "Saved: 8. Counts right away." and "Undo", or the held / hidden / stale wording; Undo puts
  back the score before or deletes the new rating (a held one cannot be undone and the bar says so).
  Failed: the selection reverts and a white bar with an ink border says "Couldn't save. …" with
  "Retry". Rated before this screen opened: one collapsed row ("G-9 · you gave it", a 40 px brand
  square with the score, "Change", which opens the full form so a comment or photo is never lost).
  Signed out, a tap opens the rate flow's score step with the score filled in.
- **Rate flow** (`/rate`, `RateFlow`): Steps; "Where did you eat?" (city switch, search, result list,
  suggest a restaurant); "What did you eat?" (44 px dish chips with `DishIcon`, "On the menu here",
  "Popular dishes", propose a dish); "How was it?" (the `ScoreGrid`, "Add details (optional)" with
  sub-scores, comment and photo, Submit). Step titles are 28 / 30 h1s. Signed out, the tapped score
  goes into the address and the sign-in's return address.
- **Success** (`DoneStep` in `RateFlow`): a 60 px `success` circle with a white tick, −6°; H1
  "Shukriya! Your rating is in."; "Chicken Karahi at …" in muted. The **success card** (blush,
  `rounded-block`): the score in brand 56 px beside "Your score" and its status ("Counts right
  away", "Replaces your earlier rating, counts right away", "Under review", "Not counted",
  "Saved"); the seats (earlier raters ticked, "You") only while missing raters are what keeps the
  place from ranking or as it ranks now; the impact line ("3 more raters and this place ranks.",
  "1 more rater …", "This place ranks at the next update.", "This place is now ranked #N for
  Chicken Karahi.", "Your vote is in the ranking."); "Know someone who ate there? Send them the list
  and they can add theirs."; Primary `cta` "Share on WhatsApp" (Web Share, else `wa.me`). A held,
  hidden or stale rating gets its own sentence and no share. Then Outline "Rate more places for
  Chicken Karahi" (back into rate mode) and "Rate another dish here", and the links "Rate somewhere
  else" and "My ratings". The second saved rating may bring up the install card.

### Restaurant page `/[city]/r/[slug]` (ISR)

- **Header**: blush, rounded bottom (`rounded-b-sheet`; a full `rounded-sheet` card from 640 px):
  round Back and Share, a pin and "F-7, Islamabad", H1 "What to order at **Sample Karahi House**"
  (28 / 30, the name in brand), "3 dishes ranked here by diners." (or "No dish ranks here yet. Rate
  one you've had."), "Owner on Kahan Khayen" when claimed, and on an auto-listed restaurant no
  admin has checked "Listed from open map data; our team has not checked it yet."
- **Ranked dishes** + "Rank is this place's position for that dish across Islamabad.":
  `RankedDishRows`, best rank first, each a card link to the dish page (grid `64px 1fr auto`): a
  64 px no-photo tile (never a dish photo), dish name, rater count (Display 18 px) "raters" and the
  score pill, "from" price; on the right the rank (#1 a 44 px gold disc, others a 28 px numeral)
  over "of 7".
- **Not ranked here yet**: `UnrankedDishRows`, contender-style rows with what is still needed ("Be
  the first to rate it here") and a Rate pill. Then the Add row "Rate another dish here", or an
  EmptyState "No dishes listed yet" with "Rate a dish here".
- **Find it**: a bordered card with the address, the phone (only on a checked or claimed listing)
  and Outline "Open in Google Maps" (a plain link from our own coordinates). Then the menu photo
  box (panel, owner, admin), Report a problem and the owner claim as disclosures, and small print
  ending "Is this your place? Dispute a listing."

### Share images

All drawn with `next/og` (Satori) from `ShareArt` parts, plain hex colours (`OG`), the fonts from
`shareImageFonts()`, the dish photo as a data URI when `config/dish-photos.json` lists a JPEG or
WebP (an AVIF falls back to the tile), else the tile colour and its glyph in full white. No text
under 22 px on a link preview. Two versions per dish and city, by state: no place ranked → voting
open (seats); at least one ranked → ranked (podium). The images show ranks and rater counts, never
a score.

- **Link preview, 1200 × 630** (`app/(public)/[city]/[slug]/share-image/route.tsx`): blush
  ground. Left: the logo row, the title (voting open as the question "Where's the best _chicken
  karahi_ in Islamabad?" with the dish in brand; ranked "Best Chicken Karahi in Islamabad"), then
  the seats with "Pehla vote / aap ka?" (or "Agla vote aap ka?") or a 620 × 180 podium (#1 gold
  180 px, #2 and #3 white, 140 and 116 px), the Roman-Urdu line, and the brand pill "Vote karein ·
  <site host>". Right 500 px: photo or tile, with the "Voting open" sticker.
- **WhatsApp status, 1080 × 1920** (`…/share-image/status/route.tsx`): a 560 px photo or tile
  panel with the white logo pill and the sticker, then a white sheet overlapping it by 64 px
  (radius 64): the title, the seats or a podium (#1 gold 310 px, #2 240 px and #3 190 px
  `blush-strong`; numerals and "12 raters"), the call, the note ("A place needs at least 4 raters
  to rank."), the Roman-Urdu line, the closing line of a featured round, the 108 px brand pill and
  small print. The top 200 px and bottom 250 px hold nothing that matters. Offered as "Get the
  WhatsApp status image" under the dish page's Share button.
- **Default image** (`app/opengraph-image.tsx`, home, city, restaurant and trust pages): blush
  ground, the logo, the tagline and its English line, the two cities and the address pill; on the
  right a brand panel with the mark large in white with its gold bar.
- **Versioning**: both dish images' URLs carry `?v=`, a hash of what they draw
  (`shareImageFacts` in `src/server/services/share-image.ts`), so a changed ranking is a new URL
  and WhatsApp and Facebook do not keep the old picture. The page sets `og:image:width` and
  `height` so Facebook shows it on the first share. Rendered per request.

### Pages the design did not draw

Built in the same system (spec §8): sign-in (wordmark `lg`, 28 / 30 "Sign in", one sentence, the
Google button in a blush block, small print with terms and privacy; in an app's built-in browser
`OpenInBrowser` replaces the button, 2026-11-11), the invite page (`components/auth/JoinView.tsx`,
`JoinPanel.tsx`), My ratings (`/me`: `PageHeader` with a Rate pill, `RowList` rows with a 56 px dish
tile (never a photo), dish, restaurant · area · date, the diner's score, status badge, comment, Edit
and Delete; claims; "Your account" with Owner area, Admin, Sign out and Delete my account), the
owner pages, the rate flow, and the trust pages (`Prose`: about, how rankings work, data sources,
privacy, terms, dispute; `InkBlock` on About). The problem pages use `ProblemPage`.

## Admin

Tokens only: the admin keeps its plain layout (a sidebar from 1024 px, a scrolling row of pills
below; `AdminHeader`, `AdminTabs`, `AdminList`, `AdminNote`, `AdminPagination`) and picks up the
palette through the token names, including the older aliases. Dense rows may use the `sm` and `xs`
button sizes. No other redesign work there.

## Installable (PWA)

- `src/app/manifest.ts` serves `/manifest.webmanifest` from `BRAND`: standalone display, start URL
  `/`, theme and background colours (still the earlier values, see Brand), 192 and 512 px icons and
  a maskable 512 px icon.
- `public/sw.js` (registered by `components/pwa/PwaRegister.tsx` on production builds) caches only
  `/_next/static/*`, `/icons/*`, the manifest and the favicon, plus the `/offline` page. Pages, API
  responses and anything signed-in are never cached.
- `components/pwa/InstallPrompt.tsx` offers "Add Kahan Khayen to your home screen" after the second
  saved rating or on a second-day visit, with Add and Not now (hidden 30 days); on iPhone "Share →
  Add to Home Screen" (`src/lib/pwa-prompt.ts`, localStorage in try/catch). Never inside the
  installed app. No push notifications.
- Test: `tests/unit/ops/pwa.test.ts`.

## Rules for every screen

- **Mobile-first at 360 px**: no horizontal scroll; long names wrap (`break-anywhere`), never
  truncate.
- **Tap targets at least 44 px** on every public control (score buttons 44 px, list controls 44 px,
  tabs 54 px, round buttons 44 px).
- **Text contrast at least 4.5:1** (table above).
- **Gold only for rank 1** (and the logo's bar). **A score never without its rater count. Never a
  count of zero. Every empty list gets an `EmptyState` with one action.**
- **The brand name only from `src/lib/brand.ts`**; the Urdu name only as SVG outlines.
- **Fonts committed in `src/fonts`, loaded with `next/font/local`**, never `next/font/google`.
- **Public pages are ISR** (`revalidate = 3600`), read the session in the browser, put the `<h1>`
  and main content in the first HTML, and have no `loading.tsx`. Loading states are static blush
  blocks, no shimmer.
- **Images**: at most one `priority` image per page (the dish header or featured photo), the rest
  lazy; `next/image` serves WebP at quality 70 in a few widths (`next.config.ts`; Vercel Hobby
  counts transformations). A dish with no photo needs no image request. Real photos only, never
  AI-generated, never beside a restaurant.
- **Light pages**: minimal client JS (rate mode and the desktop search load only when needed), no
  chart libraries on public pages.
- Lighthouse figures in docs/11 (Performance) predate this redesign.
