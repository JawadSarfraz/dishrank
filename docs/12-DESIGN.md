# 12 — Design

The look of Kahan Khayen from the redesign of 2026-11-05 (Part 3 of the audit-and-redesign task):
direction A, "Scoreboard", with the owner's changes (green score bands, gold only for the top
place, the podium share image, the "what your rating did" message, live thresholds in the copy,
"from" prices, the account menu, only the font weights in use) and the installable app. Light theme
now; every colour is a token, so a dark theme is a second block of values, not a rewrite.

Everything below is implemented in `src/app/globals.css` (tokens), `src/lib/brand.ts` (the name),
`src/components/ui/*` and `src/components/brand/*` (the parts), and the pages. Before and after
screenshots of every screen at 360 px and 1280 px are in `tmp/design/before` and
`tmp/design/after` (gitignored; made with `tmp/shots/shoot.ts`).

## Brand

- **Name in one place.** The product is Kahan Khayen (Urdu کہاں کھائیں, "where should we eat?";
  renamed from DishRank on 2026-11-06). `src/lib/brand.ts` exports `BRAND` (name, Urdu name, short
  name, tagline, English tagline, description, theme and background colours). Pages, the share
  images, the manifest and the header read it; the root layout's title template appends it
  (`%s · Kahan Khayen`). Internal names (the repo, the database, the package, env vars, cookie and
  cache prefixes) stay `dishrank`. Changing the name again is a one-line change plus new Urdu
  outlines (`src/fonts/README.md`), a new Google OAuth consent-screen name and, if the mark
  changes, `pnpm icons:build` (the icons carry no text).
- **Tagline.** "Har dish ka pehla number" (Roman Urdu, "the number one for every dish"), always
  with its English line "Restaurants ranked dish by dish, by people who ate there." Home hero lead,
  footer and the default share image.
- **Voice.** Short, plain words; opinions, never facts about a restaurant (CLAUDE.md rule 9);
  every score shows its vote count; "Not enough votes yet" is an invitation, never an apology.
  When a count is zero, the zero is not shown: the invitation is (2026-11-11). A dish with no
  votes says "12 contenders. Voting is open." and "Be one of the first four to rate. You decide
  the first ranking."; the badge says "New list · 4 votes rank a place", never "Early rankings ·
  4 raters needed"; a dish with no contenders says "We're picking the contenders. Know a place
  that belongs here? Tell us." with the way to rate a place beside it; and the link preview of
  such a page (title, description, image) reads "Vote: who makes the best chicken karahi in
  Islamabad? 4 votes put a place on the list." The 1–10 rows carry two anchors, "1 = bad" and
  "10 = best I've had".
- **Wordmark.** The mark, then two lines: "Kahan Khayen" in Bricolage Grotesque ExtraBold,
  tracking −0.025 em, over کہاں کھائیں in brand green (`Wordmark` in
  `src/components/brand/Logo.tsx`; sizes sm 16 px, md 18 px, lg 30 px). The Urdu name is Noto
  Nastaliq Urdu Bold shaped by HarfBuzz and flattened to one SVG path
  (`src/components/brand/urdu-name.ts`, OFL 1.1), defined once per page as an SVG symbol by the
  root layout (`UrduNameDefs`) and referenced by every `UrduName`, so no Urdu web font is loaded
  and the 6 KB path is in the HTML once. An optional tag ("Beta" in beta mode) sits after the Urdu
  name on the second line, which is why the lockup (164 px at header size) still fits a 360 px
  header beside "Rate" and "Sign in".
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

Two faces, both SIL Open Font License 1.1, committed in `src/fonts/` as variable WOFF2 files
(latin subset, one file per family, about 41 KB and 29 KB, taken from the Fontsource builds of the
Google Fonts releases; provenance and licences in `src/fonts/README.md`) and loaded with
`next/font/local` (`src/app/fonts.ts`, used by the root layout and the global error page), so they are served from this site and neither a page nor a build calls Google
(fetching them at build time with `next/font/google` fails at random, vercel/next.js#99114). Only
the weights in the table are used. `display: "fallback"`: a size-adjusted fallback paints at once
and the real face swaps in only when it arrives within about three seconds, so a slow first load
never reflows late:

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
| Header | `components/layout/SiteHeader.tsx` | Sticky, 56 px, solid background (list text showed through the translucent one). Wordmark (with the Beta tag on its second line in beta mode), "Rate a dish" (hidden on /rate), then Sign in or the account menu: a 44 px initial disc opening My ratings, Owner (OWNER), Admin (ADMIN), Sign out. Reads the session in the browser, so public pages stay static. |
| Footer | `components/layout/Footer.tsx` | Wordmark, tagline, the six trust links (dispute included, rule 9), one line "scores are opinions". |
| Button, ButtonLink | `components/ui/button.tsx`, `button-link.tsx` | default (brand), outline, secondary (brand-soft), ghost, destructive, link; sizes default 44 px, lg 48 px, sm 40 px and xs 32 px for dense admin rows only. A link that looks like a button is a real `<a>` (ButtonLink). |
| Fields | `.field`, `.field-select` utilities | 44 px, 16 px text, white, brand focus ring; selects carry their own chevron. `Input` wraps the same look for forms. |
| ScoreBadge, ScorePill | `components/ranking/ScoreBadge.tsx` | The score in its band colour, display bold, tabular; `ScoreBadge` always adds the vote count (inline, stacked, or votes first: the votes large and the score small under them). Sizes sm/md/lg/xl. |
| RankDisc | `components/ranking/RankDisc.tsx` | Gold, silver and bronze discs for 1–3 (ink text), paper for the rest; `aria-label="Rank n"`. |
| Rank rows | `components/ranking/RankingBrowser.tsx` | Disc, name (display 700), area and distance, "from Rs 1,900" and variant chips, then the stacked score and "Rate this". While a city is in early rankings the row leads with rank and votes and the score stays, smaller: with few votes the scores sit close together. Rank 1 gets a gold-soft tint that fades to white. |
| Filter bar | same | "Filters" opens a bottom sheet (`components/ui/sheet.tsx`, Base UI dialog) with area, minimum score and minimum votes and a "Show n restaurants" close; sort is a native select in the bar; "Near me" asks for the location only when tapped. Filters stay in the URL. |
| Waiting list | `components/ranking/WaitingList.tsx` | "Not enough votes yet" rows with votes, what is still needed (in raters, like the badge), a progress bar toward the live rater threshold and a Rate button that deep-links into the flow. |
| Contenders | `components/ranking/Contenders.tsx` | The places on the dish's list that nobody has rated yet (docs/01 D2a): name, area and distance, a Rate button; never a disc or a score, shuffled on the server at each render so the order cannot read as a ranking and no row gains from being first. Header "Contenders · Missing one? Add it." (the link opens the rate flow's suggest form); the open-data credit stays on /about/data and on unchecked restaurant pages. An area select and "Near me" in the browser; 10 rows, then "Show more". While "Rate the places you know" is open, this list, the waiting list and the ranking give way to the panel. |
| Quick rate | `components/ranking/QuickRate.tsx`, `QuickRatePanel.tsx` | "Rate the places you know": the filled primary button on a dish page (the loud one; the header's "Rate a dish" is secondary there); the list and its code load when opened. Each row has 10 score buttons of 44 px height (5 across below 640 px, 10 from there up, so each stays at least 44 px wide), and one tap saves. A rating given earlier shows "You gave it n · Change". Signed out the list is the same, and a tap opens the rate flow's score step with that score filled in. |
| Dish tiles and chips | `components/ranking/CityDishGrid.tsx`, `components/rate/RateFlow.tsx` | Icon, dish name, "#1 name" with score and votes, or "N contenders" (else "Not enough votes yet") and "Rate one you know". Chips are 44 px pills with the dish icon. |
| Trust box | `components/ranking/TrustBox.tsx` | Brand-soft card with three points; the rater count is the city's live threshold. |
| EmptyState | `components/ui/empty-state.tsx` | Dashed card: icon, one-line title, one sentence, one action. Used on every empty list. |
| Skeleton | `components/ui/skeleton.tsx`, `loading.tsx` files | The city, ranking and restaurant pages show their shape while rendering. The cached page swaps it for the content on load, so it and its page both have `min-h-dvh`: the footer stays below the fold in both, or a long list moves it (CLS). |
| Toasts | `components/ui/toast.tsx` (Base UI) | Share → "Link copied"; sign-out failure. The viewport sits above the install card. |
| Disclosure | `components/ui/disclosure.tsx` | A native `<details>` as a card: report a problem, claim, suggest, add details, delete account. |
| Badge | `components/ui/badge.tsx` | default (brand-soft), secondary, outline, destructive, gold (unused by design; kept for the medals' siblings). |
| Steps | `components/rate/Steps.tsx` | Restaurant → Dish → Score with ticks. |
| Admin shell | `app/admin/layout.tsx`, `components/admin/AdminNav.tsx`, `AdminPage.tsx` | A sidebar from 1024 px, a scrolling row of pills below; `AdminHeader`, `AdminTabs`, `AdminList`, `AdminNote`, `AdminPagination`. Clean, not fancy. |
| 404, error, Forbidden, Offline, global error | `components/layout/ProblemPage.tsx`; `app/not-found.tsx`, `app/error.tsx`, `components/auth/Forbidden.tsx`, `app/(public)/offline/page.tsx`, `app/global-error.tsx` | One shape, `ProblemPage`: an icon in a brand-soft disc (a plate for the 404, the mark for the global error), a balanced title, one line, one or two buttons, centred in the narrow column. `global-error.tsx` is the last resort when the root layout itself fails: it replaces Next's own black "This page couldn't load" screen, so it carries the fonts (`app/fonts.ts`) and styles itself, and offers Reload. |

## Screens

- **Home.** City pills, the question ("Where's the best *chicken karahi* in Islamabad?", the dish
  being the city's first featured dish), one sentence, the dish search (Roman-Urdu tolerant), then
  "Open for voting": the one or two featured dishes as large cards (`FeaturedDishes`: icon, name,
  "#1 …" with score and votes or "12 contenders · Voting is open", "Vote →") and the round's line
  "Voting for the winter results closes Sun 20 Dec" until that day has passed (the ranking never
  closes); "More dishes": the smaller grid of the other dishes with at least one contender (2
  columns from 360 px, 3 from 640 px; names wrap, nothing scrolls sideways); "Coming next": the
  dishes with no contenders as chips, with "Tell us which places should be on the list"; the trust
  box. Clear in three seconds what this is. The featured dishes, the round's name and its closing
  day are set per city on /admin/rankings (2026-11-11).
- **City.** The same with the city's name, the "New lists · n votes rank a place" chip while it
  applies, "Open for voting", "More dishes" and "Coming next".
- **Ranking.** Breadcrumb, chip, dish icon and title, the summary line ("3 restaurants ranked
  from 16 votes · 1 more collecting votes"; with no votes "12 contenders. Voting is open."), while
  nothing ranks the progress line ("2 of 4 raters so far for the first ranked Pizza in Islamabad";
  with no raters "Be one of the first four to rate. You decide the first ranking."), the filter bar, the ranked list with medals, the
  waiting list, the threshold note (live numbers) and Share. Empty: "Nobody has rated … yet" with
  a Rate button. Static (ISR); the browser does the filtering.
- **Restaurant.** Name, "Owner on Kahan Khayen" when claimed, address, phone and Google Maps as
  outline buttons, the dish list with ranks, "from" prices, scores and Rate links, then the menu
  photo box (panel, owner, admin), Report a problem and Is this your restaurant? as disclosures.
- **Rate flow.** Steps; Where did you eat? (city pills, search, result cards, Suggest a
  restaurant); What did you eat? (pills with Change, "On the menu here" and "Popular dishes"
  chips, search, Propose a dish); How was it? (the 1–10 grid, 56 px buttons, scale hints, Add
  details with sub-scores, comment and photo, Submit); still four taps after the search. Signed
  out, the tapped score goes into the address and into the sign-in's return address, so it is
  filled in afterwards and one tap submits it.
- **Success.** "Thanks, your rating is in." Your score as a large ink number (never dark on
  green). Ranked: "What your rating did: X stays #1 / enters the list at #4 / moves up from #3 to
  #2 …, now from n votes" plus the row's score badge and the Early rankings chip. Not ranked yet: a
  progress bar and "2 of 4 raters so far: X needs 2 more raters to rank for Y" (with enough raters
  but too little weight, "needs a few more ratings"). Then
  "Rate another dish here", "Rate more places for <dish>" (back to the dish page's list), Share
  (the ranking when ranked, the restaurant otherwise), "Rate somewhere else" and "My ratings". The second saved rating may bring up the install card.
- **Sign in.** The wordmark (lg), "Sign in", one sentence on why, "Continue with Google", terms and privacy
  links; fixed texts for the beta and ban refusals. Inside the Facebook, Instagram, Messenger and
  TikTok browsers, where Google refuses its sign-in, every sign-in step shows `OpenInBrowser`
  instead of the button: on Android "Open in Chrome" (an `intent://` link to the same page) and
  Copy link, on iPhone "Tap ••• then Open in Safari" and Copy link.
- **My ratings.** Rows with the dish icon, name, restaurant, date, the diner's score as a large
  number, status chip, comment, Edit and Delete; claims; Your account with Delete my account.
- **Owner.** Your restaurants (empty state explains the claim); a restaurant's dishes with status
  chips, rank, "from" price, score and votes, Rank by week, the confirm / fix / remove actions,
  the menu photo box.
- **Admin.** Overview cards with counts, one of them the held ratings; every list page as
  `AdminHeader` + tabs + `AdminList`; `/admin/contenders` curates one dish in one city: the list
  as the public sees it with Remove, the linked places the rule keeps out with Add, the removed
  rows with Add back, a name search that adds a listed restaurant to this dish and any others
  ticked, and a link to add a missing restaurant with those dishes pre-ticked; the review cards keep their one-tap decisions, and a burst
  card marks the ratings that look genuine and adds "Release the ones that look genuine".
  `/admin/analytics` has weekly raters, returning raters, share clicks, a sign-ins table split by
  normal and in-app browser, and a Sources table (per week and source tag: dish-page visits, new
  raters, ratings; "(none)" for untagged; docs/01 D1b).
- **Trust pages.** `Prose` (`components/layout/Prose.tsx`): one reading column, brand links,
  tables for the trust levels.
- **Share images** (`app/opengraph-image.tsx`, `app/(public)/[city]/[slug]/share-image/route.tsx`).
  Paper background, the two-line wordmark (`OgWordmark`: mark, name, Urdu outlines), the site's
  address from `NEXT_PUBLIC_SITE_URL` (`OgSiteAddress`, so a forwarded image says where it came
  from), the title in Bricolage Grotesque, and a podium of the top three (gold, silver and bronze
  discs, the first in the middle and taller, each with its score band colour and votes); "Rate it
  on Kahan Khayen" when nothing ranks. In early rankings each card leads with rank and votes and
  the score is small. 1200 × 630, readable as a WhatsApp preview. The dish image's URL carries a
  version, a hash of what it draws (`server/services/share-image.ts`), so a changed ranking is a
  new URL and WhatsApp and Facebook do not keep the old picture; the page sets the image with
  `og:image:width` and `height` so Facebook can show it on the first share.
- **Share text.** The dish page and the success step's ranking share end with `BRAND.shareCall`
  ("Aap ki rai? Jo 3 jagah try ki hain, unhein rate karein:") and the link after it.

## Installable (PWA)

- `src/app/manifest.ts` serves `/manifest.webmanifest` from `BRAND`: standalone display, start
  URL `/`, theme and background colours, 192 and 512 px icons and a maskable 512 px icon.
- `public/sw.js` (registered by `components/pwa/PwaRegister.tsx` on production builds) caches
  only `/_next/static/*`, `/icons/*`, the manifest and the favicon, plus the `/offline` page and
  its build files at install. Pages, API responses and anything signed-in are never cached: a
  navigation that fails shows the offline page, everything else goes to the network untouched.
  Old caches are dropped on activate and the cache is capped at 300 entries. The CSP is unchanged
  (`script-src 'self'` covers the worker).
- `components/pwa/InstallPrompt.tsx` offers "Add Kahan Khayen to your home screen" after the second
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
- Lighthouse mobile (2026-11-06, live-mode production build, real Auto-list data, no ratings): ranking
  page 92, restaurant page 92, home 92; accessibility and best practices 100 on the ranking page. Details and the
  measurement caveat in docs/11 (Performance).

## Dark theme later

Flip `@custom-variant dark` to `prefers-color-scheme` or set `.dark` on `<html>`; the `.dark`
block already defines every token. Then re-check the contrast table and the share images (they
are always light).
