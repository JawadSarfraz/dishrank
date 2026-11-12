# Kahan Khayen redesign spec: "Garma Garam"

Handoff for Claude Code. Stack: Next.js, Tailwind, shadcn/ui. Build phone first at 360px wide. All restaurant names and numbers in the design are sample data. The HTML source of every screen is in `html/` (see `README.md`).

## 1. What changes from today's design

| Today | Redesign |
|---|---|
| Paper background, cool green and grey | White ground, chilli red brand colour, warm ink text |
| Same thin line icon on every dish | A food photo on every dish card and dish page header; until a dish has a photo, a colour tile with the dish name set large (section 4, "No-photo tile") |
| No phone navigation | Bottom tab bar on phones (Home, Search, Rate, Me); top bar on desktop |
| Pages show zeros ("0 of 4 raters") | Never show a zero. Voting-open lists use "New list · 4 votes rank a place" and a "first four" seat graphic |
| "Places to try" | "Contenders" |
| Rank and score same weight | Rank and rater count big, score small |
| Text-only success page | Success card that says what the rating did, with share as the main action |

Kept as is: the headline question, the tagline "Har dish ka pehla number", the Urdu name, the honest small print, gold only for #1, and "Rate the places you know".

## 2. Tokens

### Colours

| Token | Hex | Use |
|---|---|---|
| `white` | `#FFFFFF` | Page ground, cards |
| `ink` | `#1B1410` | Text, active city pill, trust block, #2/#3 podium badges |
| `muted` | `#6B5F58` | Secondary text, inactive tab icons |
| `brand` | `#D42A19` | Primary buttons, selected score, live dot, sticker, links on white |
| `brand-dark` | `#B32012` | Red text on blush; primary hover |
| `brand-press` | `#8F190E` | Primary pressed; link hover |
| `blush` | `#FFF1EC` | Tint surfaces: featured card, badges, Rate pill, score pill |
| `blush-strong` | `#FFE4DB` | Rate pill hover; #2/#3 blocks on share images |
| `sand` | `#F6EFEA` | Segmented-control track |
| `line` | `#EFE5DE` | Card borders, dividers |
| `line-strong` | `#D8C9BF` | Input and score-button borders |
| `dash` | `#B9A397` | Dashed "Add it" border; empty seat `#D9A99F` |
| `gold` | `#F5B800` | #1 only: rank badge, #1 podium block on share images, tallest logo bar |
| `gold-tint` | `#FFF4CC` | #1 podium block on the site |
| `success` | `#1F7A4D` | Success tick only |

Tile colours, used only for dishes with no photo yet (white text is at least 5:1 on each):

| Token | Hex | Dishes |
|---|---|---|
| `tile-tamatar` | `#C8371F` | Karahi dishes; default for any dish not listed |
| `tile-zafran` | `#B4530F` | Rice dishes: biryani, pulao, mandi |
| `tile-masala` | `#8B4A1F` | Nihari, haleem, namkeen gosht |
| `tile-koyla` | `#5C3A2A` | Seekh kabab, chapli kabab |
| `tile-chai` | `#8C5E3C` | Chai |
| `tile-anaar` | `#9E2A4B` | Tikka, malai boti |

Rules:
- Gold never appears for anything except rank 1.
- Red text on blush must be `brand-dark`. `brand` on blush is allowed only at 24px bold or larger.
- All text pairs above are at least 4.5:1. Do not put `muted` on any background darker than `blush-strong`.
- Store the tile colour and glyph family on the dish record so a dish always looks the same.

### Fonts

Two Google families, loaded with `next/font/google`, `display: swap`:
- Display: **Bricolage Grotesque**, weights 700 and 800. Headings, card titles, numerals, sticker.
- Body: **Figtree**, weights 400, 500, 600, 700. Everything else.

The Urdu wordmark کہاں کھائیں is part of the logo and ships as an SVG (Nastaliq outlines). Do not load an Urdu webfont.

### Type scale (phone)

| Role | Font | Size / line | Weight | Tracking |
|---|---|---|---|---|
| Page title (dish page H1) | Display | 32 / 34 | 800 | -0.02em |
| Hero title (home, restaurant, success) | Display | 28 / 30 | 800 | -0.015em |
| Section title | Display | 24 / 28 | 800 | -0.01em |
| Sub-section title | Display | 20 / 24 | 800 | 0 |
| Tile title (no-photo dish card) | Display | 20 / 22 | 800 | -0.01em |
| Card title | Display | 17 / 20 | 700 | 0 |
| Rank numeral (list) | Display | 26 / 28 | 800 | 0 |
| Rater count (list) | Display | 22 / 24 | 800 | 0 |
| Your score (success) | Display | 56 / 56 | 800 | -0.02em |
| Body large | Figtree | 16 / 23 | 400 | 0 |
| Row title | Figtree | 16 / 22 | 700 | 0 |
| Body | Figtree | 15 / 20 | 400 to 700 | 0 |
| Body small | Figtree | 14 / 20 | 400 | 0 |
| Caption, small print | Figtree | 13 / 18 | 400 | 0 |
| Chip, tab label | Figtree | 12 / 16 | 600 to 700 | 0 |

Desktop (1024px and up): home H1 60 / 62, section title 32 / 36, card title 20 / 24, body 16 / 24. Use `text-wrap: balance` on every H1.

### Spacing, radius, shadow

- Spacing unit 4px. Used steps: 4, 6, 8, 10, 12, 14, 16, 20, 24, 28. Page side padding 16. Gap between sections 28. Card inner padding 12 (dish card) or 16.
- Radius: 10 sticker and small chips; 12 score buttons, segmented pills, select; 14 inputs and outline buttons; 16 primary buttons; 20 cards and lists; 24 tint blocks; 28 dish-page sheet top; 999 pills and round buttons.
- Shadows:
  - `card`: `0 1px 2px rgba(27,20,16,.05), 0 6px 16px rgba(27,20,16,.06)`
  - `float` (round buttons on photos and tiles): `0 2px 8px rgba(27,20,16,.2)`
  - `cta` (primary button on dish pages, selected score): `0 6px 16px rgba(212,42,25,.28)`
  - `sticker`: `0 4px 10px rgba(27,20,16,.25)`

### Tailwind

```ts
// tailwind.config.ts -> theme.extend
colors: {
  ink: '#1B1410', muted: '#6B5F58',
  brand: { DEFAULT: '#D42A19', dark: '#B32012', press: '#8F190E' },
  blush: { DEFAULT: '#FFF1EC', strong: '#FFE4DB' },
  sand: '#F6EFEA',
  line: { DEFAULT: '#EFE5DE', strong: '#D8C9BF' },
  gold: { DEFAULT: '#F5B800', tint: '#FFF4CC' },
  success: '#1F7A4D',
  tile: { tamatar: '#C8371F', zafran: '#B4530F', masala: '#8B4A1F', koyla: '#5C3A2A', chai: '#8C5E3C', anaar: '#9E2A4B' },
},
fontFamily: {
  display: ['var(--font-bricolage)', 'system-ui', 'sans-serif'],
  sans: ['var(--font-figtree)', 'system-ui', 'sans-serif'],
},
borderRadius: { chip: '10px', control: '12px', field: '14px', button: '16px', card: '20px', block: '24px', sheet: '28px' },
boxShadow: {
  card: '0 1px 2px rgba(27,20,16,.05), 0 6px 16px rgba(27,20,16,.06)',
  float: '0 2px 8px rgba(27,20,16,.2)',
  cta: '0 6px 16px rgba(212,42,25,.28)',
  sticker: '0 4px 10px rgba(27,20,16,.25)',
},
```

shadcn variables: background white, foreground ink, primary brand, primary-foreground white, secondary blush, secondary-foreground brand-dark, muted sand, muted-foreground muted, border line, input line-strong, ring ink, radius 16px.

## 3. Global rules

- Works at 360px. Every tap target is at least 44px high.
- Focus: 2px `ink` outline, 2px offset, on every interactive element.
- Motion: 120ms ease-out on press (scale 0.98). Score select 150ms. Nothing loops. Respect `prefers-reduced-motion`.
- Loading: static `blush` blocks in the final layout. No shimmer.
- Never render a count of zero. If a number would be zero, use the wording in section 5.

## 4. Components

### Logo
36px mark (40px on desktop): a ring with two handle nubs and three bars inside, in `brand`; the tallest (middle) bar is `gold`. Beside it "Kahan Khayen" in Display 800 19 / 22 with the Urdu wordmark below at 12px in `muted`.

### Buttons

| Variant | Look | Hover | Pressed | Disabled |
|---|---|---|---|---|
| Primary | `brand` fill, white 16 to 17px 700, radius 16, height 52 (56 on dish pages, with `cta` shadow) | `brand-dark` | `brand-press`, scale 0.98 | `line` fill, `muted` text, no shadow |
| Outline | White, 1.5px `ink` border, ink 15px 700, radius 14, height 48 to 52 | `sand` fill | scale 0.98 | `line-strong` border, `muted` text |
| Rate pill | `blush` fill, `brand-dark` 15px 700, radius 999, height 44, padding 0 20 | `blush-strong` | scale 0.98 | n/a |
| Round icon | 44px white circle, ink icon 20 to 22px, `float` shadow on photos and tiles | `sand` | scale 0.96 | n/a |
| Text link | ink 14px 700 underlined, 44px tap height | `brand-press` | same | n/a |
| Add row | White, 1.5px dashed `dash` border, radius 16, height 56, plus icon and "Missing one? Add it." 15px 600 | `sand` | scale 0.98 | n/a |

Loading state for Primary: label stays, a 16px spinner replaces the leading icon, button is not clickable.

### Badges and chips
- **Status badge**: `blush` pill, padding 6 12, 8px `brand` dot, text `brand-dark` 13px 700. Copy: "New list · 4 votes rank a place" or "Early ranking · 7 of 14 places ranked".
- **Sticker**: `brand` fill, white Display 800 13px uppercase, tracking 0.04em, padding 6 10, radius 10, 2px white border, rotated -4deg, `sticker` shadow. Copy "Voting open". One per screen at most. **On a colour tile it inverts**: white fill, `brand-dark` text, no border, padding 8 12.
- **Count chip**: pill, 12px 700, padding 3 8. On photos: `ink` fill, white text. On colour tiles: white fill, ink text. "14 places" or "3 ranked".
- **#1 chip**: 20px `gold` circle, ink "1" 12px 800.
- **Score pill**: `blush` pill, ink 13px 700, padding 3 8. One decimal ("8.4").

### City switch
Two equal buttons in a `sand` track (padding 4, radius 16). Each 44px high, radius 12. Selected: `ink` fill, white 15px 700. Unselected: transparent, ink 15px 600. Use `aria-pressed`.

### Search field
Height 48, radius 14, 1.5px `line-strong` border, white fill, 20px search icon at left 14, text 15px. Placeholder "Find a dish: karahi, kadai, nihari…" in `muted`. Focus: border `ink`.

### Photo
`next/image` with `object-fit: cover`. See section 6 for sizes. If the dish has no photo, render the no-photo tile in the same box.

### No-photo tile
Most dishes launch without a photo, so this is the default look. The tile is a flat tile colour with the dish's glyph and, on cards and headers, the title moved onto the tile in white. No stripes, no "photo coming soon" text.

Glyphs: `viewBox="0 0 48 48"`, `fill="none"`, white stroke, round caps and joins. One glyph family per dish:

| Family | Dishes | SVG contents |
|---|---|---|
| karahi | chicken karahi, mutton karahi, namkeen gosht | `<path d="M3 22h42"/><path d="M10 22c0 9 6 15 14 15s14-6 14-15"/><path d="M18 15c-1.5-2 1.5-4 0-6M24 15c-1.5-2 1.5-4 0-6M30 15c-1.5-2 1.5-4 0-6"/>` |
| rice | biryani, pulao, mandi | `<path d="M5 37h38"/><path d="M9 37c0-11 6-18 15-18s15 7 15 18"/><path d="M18 28l2 1M26 25l2 1M29 31l2-1M21 33l2-1"/><path d="M24 13c-1.5-2 1.5-4 0-6"/>` |
| bowl | nihari, haleem | `<path d="M7 20h34c0 10-7 17-17 17S7 30 7 20z"/><path d="M17 42h14"/><path d="M18 13c-1.5-2 1.5-4 0-6M24 13c-1.5-2 1.5-4 0-6M30 13c-1.5-2 1.5-4 0-6"/>` |
| skewer | tikka, seekh kabab, malai boti | `<path d="M6 42 42 6"/><rect x="11" y="27" width="10" height="10" rx="2.5" transform="rotate(45 16 32)"/><rect x="19" y="19" width="10" height="10" rx="2.5" transform="rotate(45 24 24)"/><rect x="27" y="11" width="10" height="10" rx="2.5" transform="rotate(45 32 16)"/>` |
| patty | chapli kabab | `<ellipse cx="24" cy="27" rx="17" ry="11"/><path d="M16 25l2 1M24 22l2 1M30 27l2-1M20 31l2-1M27 32l2-1"/><path d="M20 11c-1.5-2 1.5-4 0-6M28 11c-1.5-2 1.5-4 0-6"/>` |
| cup | chai | `<path d="M11 18h22v7a11 11 0 0 1-22 0z"/><path d="M33 20h3a4.5 4.5 0 0 1 0 9h-3.6"/><path d="M8 42h28"/><path d="M18 12c-1.5-2 1.5-4 0-6M26 12c-1.5-2 1.5-4 0-6"/>` |

Where it appears:

| Slot | Tile |
|---|---|
| Dish card | 112px high (176 on desktop), padding 12, clipped. Title top-left in white, tile title style, max width 124px. Glyph 76px, stroke 3, opacity 0.4, at right -8, bottom -12. Count chip (white) at bottom-left 8 |
| Featured vote card (home) | Min-height 196, padding 16, clipped. Inverted sticker at top-left 14. Glyph 128px, stroke 2.4, opacity 0.35, at right -18, top -12. H1 hero title in white, bottom-aligned, starting at least 68px below the tile top so it clears the sticker |
| Dish page header | Band in the tile colour, padding 12 16 44, clipped. Round Back and Share buttons; breadcrumb in white 13px (link white, 700, underlined); H1 page title in white, max width 270px. Glyph 176px, stroke 2.2, opacity 0.35, at right -52, top 40 |
| Desktop home hero (not drawn) | The 400px panel in the tile colour with the glyph centred at 220px, stroke 2, full white. The H1 stays in the left column |
| Restaurant dish row (not drawn) | 64px square in the tile colour, radius 14, glyph centred at 40px, stroke 3, full white |
| Share images | See section 7 |

When a photo is added, the same component switches to the photo layout; nothing else on the page changes.

### Featured vote card (home)
`blush` block, radius 24, clipped.
- **With photo**: photo on top, 184px high, sticker at top-left 14px. Body padding 16: H1 hero title with the dish name in `brand`; line "Aap ki karahi ka number kya hai?" 15px 600; Primary button "Vote for your karahi" with arrow; centred line with clock icon "Voting closes Sun 20 Dec" 13px 600.
- **No photo**: no-photo tile on top carrying the sticker and the H1 (all white). Body: the Roman-Urdu line, the Primary button and the closing date.

### Dish card
Whole card is a link. White, 1px `line` border, radius 20, `card` shadow, clipped. Phone grid: 2 columns, gap 12. Desktop: `repeat(auto-fit, minmax(250px, 1fr))`, gap 24.
- **With photo**: photo 112px high (176 on desktop) with an `ink` count chip at bottom-left 8px. Body padding 12, gap 6: title (card title style), status line, last line.
- **No photo**: no-photo tile in place of the photo, with the title on the tile. Body padding 12, gap 6: status line and last line only (no second title).
- Status line by state:
  - **Voting open**: 8px `brand` dot + "Voting open" in `brand-dark` 13px 600. Last line "Rate one you know →" ink 13px 700. Chip "N places".
  - **Ranked**: #1 chip + name of the #1 place, ink 13px 600. Last line "See the ranking →". Chip "N ranked".
- Keep "you know →" together with non-breaking spaces so the arrow never wraps alone.
- Hover (desktop): shadow grows to `0 10px 24px rgba(27,20,16,.10)`. Pressed: scale 0.98.

### "First four" seats (voting-open pages)
`blush` block, radius 20, padding 16. A row of four circles, gap 10: the first is 52px `brand` with white "You?" (Display 800 14px), 2px white border, rotated -6deg; the other three are 48px with a 2px dashed `#D9A99F` border and the numerals 2, 3, 4 in `muted`. Below: "**Pehla vote aap ka?** A place joins the ranking after 4 diners rate it." 14 / 20. On the success page the same row shows earlier raters as `ink` circles with a white tick and the user as "You".

### Contender row
Rows sit in one list with a 1px `line` border, radius 20, `card` shadow, dividers 1px `line`. Row min-height 68, padding 10 12 10 16: name (row title), area below in `muted` 13px, Rate pill at right. Long names wrap; never truncate. On ranked pages the second line may carry progress: "G-13 · 2 more raters and it ranks" or "Bani Gala · be the first to rate".

### Podium (ranked dish page)
Three columns, gap 8, bottom-aligned, visual order 2, 1, 3 (DOM order 1, 2, 3). Each column is a link to the restaurant page: rank badge, place name 14 / 18 700 centred, area 12px `muted`, then a block with rounded top (16).
- #1: badge 52px `gold`, ink numeral 28px. Block 132px high, `gold-tint`.
- #2 and #3: badge 40px `ink`, white numeral 20px. Blocks 104px and 88px high, `blush`.
- Inside each block: rater count (Display 800, 34px for #1, 28px for others), "raters" 12px 600, then "Score 8.4" 13px 500.

### Ranking row
Ordered list in one bordered container (as contender rows). Each row is a link, grid `36px 1fr 44px 40px`, gap 8, min-height 68:
1. Rank: #1 in a 36px `gold` circle; others as a plain Display 800 26px numeral.
2. Name (row title) and area.
3. Rater count (22px Display 800) over "raters" 11px `muted`.
4. Score pill.
Header above the list: "Full ranking" + "7 ranked", then "Updated 3 days ago · scores out of 10" in `muted` 13px.

### Score row (rate mode)
Card: white, 1px `line` border, radius 20, `card` shadow, padding 14 16 12, gap 10. Top line: place name (row title, as an `h2`) and area right-aligned in `muted`. Then ten buttons in a 5-column grid, gap 8 (two rows of five). Then a line with "1 = bad" left and "10 = best I've had" right, 12px `muted`.

Score button: height 44, radius 12, 1.5px `line-strong` border, white, ink 16px 700.

| State | Look |
|---|---|
| Default | As above |
| Hover | Border `ink` |
| Selected | `brand` fill and border, white text, `cta` shadow; card border becomes 1.5px `brand` |
| Saved (after a tap) | A status bar appears under the legend: `blush`, radius 12, min-height 44, tick icon, "Saved: 8. Counts right away." in `brand-dark` 13px 700, and an "Undo" text link at right. Undo clears the score. The bar stays until the user leaves the screen |
| Rated earlier (collapsed) | One row, min-height 72: name, "G-9 · you gave it", a 40px `brand` square (radius 12) with the score in white Display 800 20px, and a "Change" text link that expands the card |
| Save failed | Selection reverts; status bar in white with 1px `ink` border: "Couldn't save. Try again." and "Retry" |

A tap saves at once (optimistic). One rating per person per dish per place.

### Rate action bar
Fixed to the bottom in rate mode, replacing the tab bar. White, 1px `line` top border, padding 12 16. Left: "2 places rated" 15px 700 over "Saved as you tap" 12px `muted`. Right: Primary "Done", height 52, padding 0 32. Hidden until at least one place is rated.

### Success card
`blush` block, radius 24, padding 16: the score in `brand` 56px beside "Your score" / "Counts right away"; the seats row; "2 more raters and this place ranks." (Display 800 20 / 24); "Know someone who ate there? Send them the list and they can add theirs." 14px; Primary "Share on WhatsApp" with share icon (uses the Web Share API, falls back to a `wa.me` link).

Impact line by case: 3 left "3 more raters and this place ranks." · 1 left "1 more rater and this place ranks." · reaches four "This place is now ranked #N for Chicken Karahi." · already ranked "Your vote is in the ranking."

### Restaurant dish row
Card link, grid `64px 1fr auto`, gap 12, padding 12, radius 20, `card` shadow: 64px square photo or no-photo tile (radius 14); dish name (card title) over a line with the rater count (Display 800 18px), "raters", and the score pill; at right the rank (#1 in a 44px `gold` circle, others as a 28px numeral) over "of 7" 11px `muted`.

### Trust block
`ink` block, radius 24, padding 20, white text. Title "Why these ranks can be trusted" (sub-section title). Three lines with 20px white icons, text `#E9DED6` 14 / 20:
1. "Every rating comes from a real person on Kahan Khayen. Nothing paid, copied or generated."
2. "A place ranks once 4 different people have rated the dish there."
3. "Rankings are never for sale."
Then "How rankings work" as a white underlined link.

### Tab bar (phones, below 1024px)
Fixed bottom, white, 1px `line` top border, padding 6 8 8 plus the safe-area inset. Four equal links, each 54px high: 24px icon over a 12px label.
- Home, Search, Me: `muted`, label 600. Active: `brand` icon and label, 700.
- Rate: icon is a white star in a 48×32 `brand` pill; label ink 700. Always emphasised.
- Hidden in rate mode (the action bar takes its place) and when the keyboard is open.

### Top bar
- Phone: 64px, logo left, "How it works" link right. Not sticky.
- Desktop (1024px and up): one row, max width 1240, padding 12 32, 1px `line` bottom border: logo; links "Dishes" and "How rankings work"; then right-aligned: city switch (40px high), search field (210px wide), Primary "Rate a dish" (48px high, star icon), "Sign in". No tab bar on desktop.

## 5. Pages

### Home
Header → city switch → search → featured vote card → "Har dish ka pehla number" (section title) with "Restaurants ranked dish by dish, by people who ate there." → dish cards (first six, then Outline "See all 19 dishes") → trust block → small print "Scores are diners' opinions, not facts about a restaurant. Something wrong? Tell us." → tab bar.

Desktop: top bar; hero in two columns (text left with sticker, H1, Roman-Urdu line, Primary button and closing date, tagline; photo or tile right, 400px high, radius 28); "Dishes in Islamabad" with "See all 19 dishes →"; four-column card grid; trust block with its three lines in columns; footer with How rankings work, Dispute a listing, About, Data sources, Privacy, Terms and the small print.

### Dish page, voting open
**With photo**: full-width photo 232px high with round Back (left) and Share (right) buttons at 12px. White sheet overlaps the photo by 28px, radius 28 on top, padding 20 16:
1. Breadcrumb "Islamabad › Chicken Karahi".
2. Status badge "New list · 4 votes rank a place".
3. H1 "Best Chicken Karahi in Islamabad".
4. "Be one of the first four to rate. You decide the first ranking." (body large).
5. "First four" seats.
6. Primary "Rate the places you know" (56px, star icon). Helper: "One tap per place, 1 to 10. Sirf wahan rate karein jahan khaya ho."
7. "Contenders" + "14 places"; "Not ranked yet, listed A to Z."; filter row (select "All areas", button "Near me", both 44px); all contender rows; Add row.
8. Small print: "A place gets a rank for this dish once 4 different people have rated it there. Scores are diners' opinions, not facts about a restaurant. How rankings work".

**No photo**: the no-photo header band carries the buttons, the breadcrumb and the H1. The sheet overlaps it by 28px and starts at step 2; steps 1 and 3 are not repeated in the sheet. Everything from step 4 on is the same.

When the Primary button scrolls out of view, show it again as a bar fixed above the tab bar.

### Dish page, ranked
Same header (photo or no-photo band) and sheet. Badge "Early ranking · 7 of 14 places ranked"; H1; "Ranked by people who ate there."; podium; Primary "Rate the places you know" with helper "Aap ki karahi ka number kya hai?"; "Full ranking" list; "Still need votes" + "7 places" with "A place joins the ranking after 4 diners rate it.", three contender rows and "Show all 7 places"; Add row; small print (adds "Recent votes count more.").

With one or two ranked places, show only those podium columns, centred.

### Rate the places you know
Back arrow and "Chicken Karahi · Islamabad"; H1 "Rate the places you know"; "One tap saves your score, 1 to 10. **Sirf wahan rate karein jahan khaya ho.**"; labelled field "Find a place in Islamabad"; score rows (rated-earlier rows first, collapsed); Outline "Show all 14 places"; Add row; action bar.

### Rating success
Header; 60px `success` circle with white tick, rotated -6deg; H1 "Shukriya! Your rating is in."; "Chicken Karahi at Demo Karahi Wala" in `muted`; success card; Outline buttons "Rate more places for Chicken Karahi" and "Rate another dish here"; text links "Rate somewhere else" and "My ratings"; tab bar with Rate active.

### Restaurant page
`blush` header block with rounded bottom (28): Back and Share buttons; pin icon + "F-7, Islamabad"; H1 "What to order at **Sample Karahi House**" (name in `brand`); "3 dishes ranked here by diners." Then:
1. "Ranked dishes" with "Rank is this place's position for that dish across Islamabad."; restaurant dish rows, best rank first.
2. "Not ranked here yet": contender-style rows per dish with "2 more raters and it ranks" or "Be the first to rate it here" and a Rate pill.
3. "Find it": bordered card with pin icon, the address, and Outline "Open in Google Maps" with an external-link icon.
4. Small print ending "Is this your place? Dispute a listing."

## 6. Images

One master photo per dish: 1600×1200 (4:3), food centred and filling at least 70% of the frame, so every crop below works with `object-position: center`.

| Slot | Displayed size | Ratio | `sizes` | Loading |
|---|---|---|---|---|
| Dish page header | 100vw × 232 | about 3:2 | `100vw` | `priority` |
| Home featured (phone) | 328 × 184 | 16:9 | `100vw` | `priority` |
| Home hero (desktop) | 560 × 400 | 7:5 | `560px` | `priority` |
| Dish card (phone) | 158 × 112 | 7:5 | `50vw` | lazy |
| Dish card (desktop) | 276 × 176 | 8:5 | `280px` | lazy |
| Restaurant dish row | 64 × 64 | 1:1 | `64px` | lazy |

- Exactly one `priority` image per page; everything else lazy.
- Serve AVIF or WebP through `next/image`, quality about 70. Targets: cover under 60 KB, card under 15 KB.
- Alt text: the dish name ("Chicken karahi").
- Real photos only: the owner's, raters', or licensed stock. No AI-generated food photos and no near-match dishes. Restaurants have no photos.
- A dish with no photo uses the no-photo tile in every slot. It needs no image request at all.

## 7. Share images

Generate per dish and city (for example with `next/og`). Pick the version by state: no ranked place yet → voting open; at least one ranked place → ranked. In both, the photo panel shows the dish photo, or the tile colour with the dish glyph in full white if there is no photo.

### Voting open (no podium)

**Link preview, 1200×630.** `blush` ground. Left 700px, padding 40 56:
1. Logo row: 56px mark, name Display 800 34px, Urdu wordmark.
2. Title as the question, Display 800 60 / 62, dish name in `brand`: "Where's the best chicken karahi in Islamabad?"
3. Seats row, gap 14: first circle 80px `brand` with white "You?" 23px, 4px white border, rotated -6deg; three circles 72px with 3px dashed `#D9A99F` border and numerals 2, 3, 4 at 26px in `muted`; then "Pehla vote / aap ka?" Display 800 30 / 34 on two lines.
4. "Aap ki karahi ka number kya hai?" 34px 700.
5. `brand` pill, 56px high: "Vote karein · kahankhayen.com" Display 800 30px white.

Right 500px, full height: photo, or tile colour with the glyph centred at 340px (stroke 2). "Voting open" sticker at top right 40 / 36, 30px, rotated 4deg (inverted on a tile). No text under 22px.

**WhatsApp status, 1080×1920.** Keep the top 200px and bottom 250px free of key content.
- Top panel 560px high: photo, or tile colour with the glyph at 380px (stroke 2), right 56, top 150. Logo pill (white, 68px mark, name 44px, Urdu wordmark) at top 212, left 56. Sticker 36px at top 360, left 64, rotated -4deg (inverted on a tile).
- White sheet overlaps the panel by 64px, radius 64, padding 64 72: question title Display 800 96 / 100 with the dish name in `brand`; seats row, gap 24 (first circle 176px with "You?" 50px and an 8px white border; three circles 160px with 6px dashed border, numerals 56px); "Pehla vote aap ka?" Display 800 64 / 70; "A place joins the ranking after 4 diners rate it." 38 / 48 `muted`; "Aap ki karahi ka number kya hai?" 54 / 62 700; `brand` pill 108px high "Vote karein · kahankhayen.com" Display 800 50px; small print 30px `muted`.

### Ranked (with podium)

**Link preview, 1200×630.** Same logo row and right panel. Title "Best Chicken Karahi in Islamabad" Display 800 56 / 58; podium 620×180 in three blocks with rounded tops (20): #1 `gold` 180px high with numeral 72px and name 26px 700, #2 white 140px, #3 white 116px; "Aap ki karahi ka number kya hai?" 34px 700; the `brand` pill. Sticker at top right as in the voting-open version.

**WhatsApp status, 1080×1920.** Same top panel and logo pill; sticker 34px at top 226, right 56, rotated 5deg. Sheet: title Display 800 96 / 100; podium columns (name 38px 700, area 30px `muted`, blocks 240 / 310 / 190px high with radius 32; #1 `gold`, others `blush-strong`; numerals 120 / 160 / 100px; "12 raters" 32 to 34px); "Aap ki karahi ka number kya hai?" 54px 700; the `brand` pill 108px high; small print 30px `muted`.

## 8. Not drawn, to build in the same system

Sign in, My ratings, the single-rating flow (restaurant → dish → score; reuse the score row), add-a-place, search results, all dishes, static pages, and admin. Use the tokens and components above. Admin can stay plain.
