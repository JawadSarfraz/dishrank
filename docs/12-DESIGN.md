# 12 — Design

The look of DishRank from the redesign of 2026-11-05 (Part 3 of the audit-and-redesign task):
direction A, "Scoreboard", with the owner's changes (green score bands, gold only for the top
place, the podium share image, the "what your rating did" message, live thresholds in the copy,
"from" prices, the account menu, only the font weights in use) and the installable app. Light theme
now; every colour is a token, so a dark theme is a second block of values, not a rewrite.

Everything below is implemented in `src/app/globals.css` (tokens), `src/lib/brand.ts` (the name),
`src/components/ui/*` and `src/components/brand/*` (the parts), and the pages. Before and after
screenshots of every screen at 360 px and 1280 px are in `tmp/design/before` and
`tmp/design/after` (gitignored; made with `tmp/shots/shoot.ts`).

## Brand

- **Name in one place.** `src/lib/brand.ts` exports `BRAND` (name, short name, tagline,
  description, theme and background colours). Pages, the share images, the manifest and the
  header read it; the root layout's title template appends it (`%s · DishRank`). Changing the
  name is a one-line change plus `pnpm icons:build` (the icons carry no text) and a new
  Google OAuth consent-screen name.
- **Voice.** Short, plain words; opinions, never facts about a restaurant (CLAUDE.md rule 9);
  every score shows its vote count; "Not enough votes yet" is an invitation, never an apology.
- **Wordmark.** The name in Bricolage Grotesque ExtraBold, tracking −0.025 em, with the mark to
  its left (`Wordmark` in `src/components/brand/Logo.tsx`).
- **Mark.** A karahi seen from above (the rim and its two ring handles) with three bars inside in
  podium order; the tallest, middle bar is gold. Drawn inline (`LogoMark`), so it takes the
  parent's colour; `scripts/make-icons.ts` renders it on a green tile for the app icons and the
  favicon (`public/icons/*.png`, `src/app/icon.svg`, `src/app/apple-icon.png`,
  `src/app/favicon.ico`). Original work; no stock art anywhere.
- **Dish icons.** Thirteen original line icons keyed by dish family
  (`src/components/brand/DishIcon.tsx`): karahi, rice, platter, bowl, skewer, patty, puri,
  burger, pizza, drumstick, wrap, cup, plate (the fallback). They stand in for photos on the dish
  tiles and chips; user photos are not shown publicly yet (OPEN-QUESTIONS).

## Tokens (Tailwind 4 theme, `src/app/globals.css`)

### Colour

| Token | Light | Use |
|---|---|---|
| `--background` | `#F7F8F6` | the page (paper, a touch of green) |
| `--foreground` | `#16201B` | text ("ink") |
| `--card` | `#FFFFFF` | lists, forms, the trust box's siblings |
| `--muted` / `--muted-foreground` | `#EEF1EE` / `#5E6963` | chips, hover rows / secondary text |
| `--border` / `--input` | `#E2E6E2` / `#C9D1CB` | hairlines / field borders |
| `--brand` | `#0E6B4A` | primary buttons, links, icons, focus ring (`--ring`) |
| `--brand-ink` | `#0A4D35` | button hover, text on `--brand-soft` |
| `--brand-soft` | `#E4F1EA` | the trust box, icon tiles, "Early rankings" chip |
| `--gold` / `--gold-ink` / `--gold-soft` / `--gold-text` | `#D4A72C` / `#3A2A00` / `#FBF1D6` / `#7A5C00` | rank 1 only: the disc, its text, the row tint, gold text on paper |
| `--silver` / `--bronze` | `#D7DCE1` / `#D9A77B` | the rank 2 and 3 discs (ink text) |
| `--destructive` | `#B42318` | delete, errors |
| `--score-top` | `#14532D` | score 9.0 and up |
| `--score-high` | `#166534` | 8.0 – 8.9 |
| `--score-good` | `#15803D` | 7.0 – 7.9 |
| `--score-mid` | `#475569` | 6.0 – 6.9 (slate) |
| `--score-low` | `#6B7280` | below 6.0 (grey) |

Score colours (`src/lib/score-band.ts`): greens from 7.0 up, darker as the score rises, slate for
6 to 7, grey below. With few votes the Bayesian prior pulls early scores to 6.5–8 (docs/04), so the
site reads green and slate; nothing is brown or red. Gold appears only on the rank-1 disc and row
tint and in the logo; silver and bronze only on ranks 2 and 3.

WCAG contrast (AA needs 4.5:1 for text, 3:1 for large text), measured on 2026-11-05:

| Pair | Ratio |
|---|---|
| white on `--score-top` / `--score-high` / `--score-good` | 9.1 / 7.1 / 5.0 |
| white on `--score-mid` / `--score-low` | 7.6 / 4.8 |
| white on `--brand` (buttons) | 6.5 |
| `--brand` on `--background` (links) | 6.1 |
| `--brand-ink` on `--brand-soft` (trust box) | 8.5 |
| `--foreground` on `--background` | 15.7 |
| `--muted-foreground` on `--background` / on white | 5.4 / 5.7 |
| `--gold-ink` on `--gold` (rank 1) | 6.2 |
| `--foreground` on `--silver` / `--bronze` | 12.1 / 7.8 |
| `--gold-text` on `--gold-soft` | 5.6 |
| `--destructive` on `--background`; white on `--destructive` | 6.2; 6.6 |

The `.dark` block in `globals.css` holds a dark set of the same tokens (not switched on anywhere;
`@custom-variant dark` is ready). Before enabling it, re-measure the table above.

### Type

Two faces from Google Fonts, self-hosted by `next/font/google` at build time (no request to
Google from a page), latin subset, only the weights in use (both families are variable fonts, so
the build fetches one latin file per family, about 41 KB and 29 KB, that covers exactly those
weights; `display: "fallback"`: a size-adjusted fallback paints at once and the real face swaps in
only when it arrives within about three seconds, so a slow first load never reflows late):

| Role | Face | Weights | Where |
|---|---|---|---|
| Display (`font-display`) | Bricolage Grotesque | 700, 800 | h1–h3, dish and restaurant names, ranks, scores, the wordmark |
| Text (`font-sans`) | Geist | 400, 500, 700 | everything else; 500 for labels, buttons and links; 700 for strong numbers |

Scale (Tailwind sizes): h1 `text-3xl` (30 px) on phones and `text-4xl` (36 px) from 640 px, 800;
the home hero 32/48 px; h2 `text-xl` (20 px) 700; h3 and list names `text-lg` (18 px) 700; body
`text-base` (16 px, never smaller in a field, so iOS does not zoom); secondary `text-sm` (14 px);
meta `text-xs` (12 px). Headings have `letter-spacing: -0.015em` and `text-wrap: balance`;
paragraphs `text-wrap: pretty` and `max-w-prose`. The share images use the same faces from TTF
files in `src/fonts/` (Satori cannot read WOFF2).

### Space, radius, shadow, motion

- Spacing on the 4 px grid; page gutter 16 px on phones and 24 px from 640 px (`Main` in
  `src/components/layout/Page.tsx`); page columns 576 px (narrow: forms, reading), 768 px
  (default) and 1024 px (wide: admin tables); sections `gap-6`, cards `p-3`/`p-4`, list rows
  `px-3 py-3`.
- Radius `--radius: 0.75rem` (12 px) for buttons, fields and rows; `rounded-xl` (16 px) for
  cards and tiles; `rounded-2xl` for sheets; pills are fully round.
- Shadows: `shadow-card` (a 1 px lift under white cards), `shadow-raised` (menus, the install
  card), `shadow-sheet` (the bottom sheet). No glows.
- Motion: colour and transform transitions of 150 ms; the bottom sheet and the install card slide
  in over 200–300 ms; `prefers-reduced-motion: reduce` collapses every animation and transition
  (global rule). No animation library.

## Components

| Component | File | Notes |
|---|---|---|
| Header | `components/layout/SiteHeader.tsx` | Sticky, 56 px. Wordmark, the Beta chip, "Rate a dish" (hidden on /rate), then Sign in or the account menu: a 44 px initial disc opening My ratings, Owner (OWNER), Admin (ADMIN), Sign out. Reads the session in the browser, so public pages stay static. |
| Footer | `components/layout/Footer.tsx` | Wordmark, tagline, the six trust links (dispute included, rule 9), one line "scores are opinions". |
| Button, ButtonLink | `components/ui/button.tsx`, `button-link.tsx` | default (brand), outline, secondary (brand-soft), ghost, destructive, link; sizes default 44 px, lg 48 px, sm 40 px and xs 32 px for dense admin rows only. A link that looks like a button is a real `<a>` (ButtonLink). |
| Fields | `.field`, `.field-select` utilities | 44 px, 16 px text, white, brand focus ring; selects carry their own chevron. `Input` wraps the same look for forms. |
| ScoreBadge, ScorePill | `components/ranking/ScoreBadge.tsx` | The score in its band colour, display bold, tabular; `ScoreBadge` always adds the vote count (inline or stacked). Sizes sm/md/lg/xl. |
| RankDisc | `components/ranking/RankDisc.tsx` | Gold, silver and bronze discs for 1–3 (ink text), paper for the rest; `aria-label="Rank n"`. |
| Rank rows | `components/ranking/RankingBrowser.tsx` | Disc, name (display 700), area and distance, "from Rs 1,900" and variant chips, then the stacked score and "Rate this". Rank 1 gets a gold-soft tint that fades to white. |
| Filter bar | same | "Filters" opens a bottom sheet (`components/ui/sheet.tsx`, Base UI dialog) with area, minimum score and minimum votes and a "Show n restaurants" close; sort is a native select in the bar; "Near me" asks for the location only when tapped. Filters stay in the URL. |
| Waiting list | `components/ranking/WaitingList.tsx` | "Not enough votes yet" rows with votes, what is still needed, a progress bar toward the live rater threshold and a Rate button that deep-links into the flow. |
| Dish tiles and chips | `components/ranking/CityDishGrid.tsx`, `components/rate/RateFlow.tsx` | Icon, dish name, "#1 name" with score and votes, or "Be the first to rate". Chips are 44 px pills with the dish icon. |
| Trust box | `components/ranking/TrustBox.tsx` | Brand-soft card with three points; the rater count is the city's live threshold. |
| EmptyState | `components/ui/empty-state.tsx` | Dashed card: icon, one-line title, one sentence, one action. Used on every empty list. |
| Skeleton | `components/ui/skeleton.tsx`, `loading.tsx` files | The city, ranking and restaurant pages show their shape while rendering. |
| Toasts | `components/ui/toast.tsx` (Base UI) | Share → "Link copied"; sign-out failure. The viewport sits above the install card. |
| Disclosure | `components/ui/disclosure.tsx` | A native `<details>` as a card: report a problem, claim, suggest, add details, delete account. |
| Badge | `components/ui/badge.tsx` | default (brand-soft), secondary, outline, destructive, gold (unused by design; kept for the medals' siblings). |
| Steps | `components/rate/Steps.tsx` | Restaurant → Dish → Score with ticks. |
| Admin shell | `app/admin/layout.tsx`, `components/admin/AdminNav.tsx`, `AdminPage.tsx` | A sidebar from 1024 px, a scrolling row of pills below; `AdminHeader`, `AdminTabs`, `AdminList`, `AdminNote`, `AdminPagination`. Clean, not fancy. |
| 404, error, Forbidden, Offline | `app/not-found.tsx`, `app/error.tsx`, `components/auth/Forbidden.tsx`, `app/(public)/offline/page.tsx` | Mark, one line, one or two buttons. |

## Screens

- **Home.** City pills, the question ("Where's the best *chicken karahi* in Islamabad?"), one
  sentence, the dish search (Roman-Urdu tolerant), the dish grid (2 columns from 360 px, 3 from
  640 px; names wrap, nothing scrolls sideways), the trust box. Clear in three seconds what this is.
- **City.** The same with the city's name, the "Early rankings · n raters needed" chip while it
  applies, and "Popular dishes".
- **Ranking.** Breadcrumb, chip, dish icon and title, the summary line ("3 restaurants ranked
  from 16 votes · 1 more collecting votes"), the filter bar, the ranked list with medals, the
  waiting list, the threshold note (live numbers) and Share. Empty: "Nobody has rated … yet" with
  a Rate button. Static (ISR); the browser does the filtering.
- **Restaurant.** Name, "Owner on DishRank" when claimed, address, phone and Google Maps as
  outline buttons, the dish list with ranks, "from" prices, scores and Rate links, then the menu
  photo box (panel, owner, admin), Report a problem and Is this your restaurant? as disclosures.
- **Rate flow.** Steps; Where did you eat? (city pills, search, result cards, Suggest a
  restaurant); What did you eat? (pills with Change, "On the menu here" and "Popular dishes"
  chips, search, Propose a dish); How was it? (the 1–10 grid, 56 px buttons, scale hints, Add
  details with sub-scores, comment and photo, Submit); still four taps after the search.
- **Success.** "Thanks, your rating is in." Your score as a large ink number (never dark on
  green). Ranked: "What your rating did: X stays #1 / enters the list at #4 / moves up from #3 to
  #2 …, now from n votes" plus the row's score badge and the Early rankings chip. Not ranked yet: a
  progress bar and "2 of 4 raters so far: needs 2 more ratings to rank before X gets a rank". Then
  "Rate another dish here", Share (the ranking when ranked, the restaurant otherwise), "Rate
  somewhere else" and "My ratings". The second saved rating may bring up the install card.
- **Sign in.** Mark, "Sign in", one sentence on why, "Continue with Google", terms and privacy
  links; fixed texts for the beta and ban refusals.
- **My ratings.** Rows with the dish icon, name, restaurant, date, the diner's score as a large
  number, status chip, comment, Edit and Delete; claims; Your account with Delete my account.
- **Owner.** Your restaurants (empty state explains the claim); a restaurant's dishes with status
  chips, rank, "from" price, score and votes, Rank by week, the confirm / fix / remove actions,
  the menu photo box.
- **Admin.** Overview cards with counts; every list page as `AdminHeader` + tabs + `AdminList`;
  the review cards keep their one-tap decisions.
- **Trust pages.** `Prose` (`components/layout/Prose.tsx`): one reading column, brand links,
  tables for the trust levels.
- **Share images** (`app/opengraph-image.tsx`, `app/(public)/[city]/[slug]/opengraph-image.tsx`).
  Paper background, the mark and wordmark, the title in Bricolage Grotesque, and a podium of the
  top three (gold, silver and bronze discs, the first in the middle and taller, each with its
  score band colour and votes); "Rate it on DishRank" when nothing ranks. 1200 × 630, readable
  as a WhatsApp preview.

## Installable (PWA)

- `src/app/manifest.ts` serves `/manifest.webmanifest` from `BRAND`: standalone display, start
  URL `/`, theme and background colours, 192 and 512 px icons and a maskable 512 px icon.
- `public/sw.js` (registered by `components/pwa/PwaRegister.tsx` on production builds) caches
  only `/_next/static/*`, `/icons/*`, the manifest and the favicon, plus the `/offline` page and
  its build files at install. Pages, API responses and anything signed-in are never cached: a
  navigation that fails shows the offline page, everything else goes to the network untouched.
  Old caches are dropped on activate and the cache is capped at 300 entries. The CSP is unchanged
  (`script-src 'self'` covers the worker).
- `components/pwa/InstallPrompt.tsx` offers "Add DishRank to your home screen" after the second
  saved rating or on the second visit (a second day), with Add and Not now; "Not now" hides it
  for 30 days; on iPhone it shows "Share → Add to Home Screen" instead (`src/lib/pwa-prompt.ts`,
  localStorage, wrapped in try/catch). It never shows inside the installed app. No push
  notifications.
- Test: `tests/unit/ops/pwa.test.ts` (the manifest and its icon files; the worker loads and
  treats only static files as cacheable).

## Quality bar (checked on 2026-11-05)

- No horizontal scroll at 360 px on any screen (`tmp/design/after/_report.json`, overflow 0
  everywhere; the e2e journeys assert it too).
- AA contrast on every text and badge colour (table above).
- Tap targets at least 44 px on every public control; the score buttons are 56 px.
- Visible keyboard focus: a 2 px brand outline on every element, plus the components' rings.
- Public pages stay ISR (`revalidate = 3600`) with the session read in the browser.
- Lighthouse mobile (2026-11-05, live-mode production build, demo data): ranking page 94, restaurant
  page 93 for performance; accessibility, best practices and SEO 100 on both. Details and the
  measurement caveat in docs/11 (Performance).

## Dark theme later

Flip `@custom-variant dark` to `prefers-color-scheme` or set `.dark` on `<html>`; the `.dark`
block already defines every token. Then re-check the contrast table and the share images (they
are always light).
