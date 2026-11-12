# Kahan Khayen redesign: handoff package (November 2026)

Design direction: **A · Garma Garam** (white ground, chilli red, photo-first food app). Build from `redesign-spec.md`; use the HTML files as the visual reference for each screen.

## Contents

| File | What it is |
|---|---|
| `redesign-spec.md` | The handoff spec: tokens, components with states, page structure, image sizes, share images, and what changes from today's design. Save it in the repo as `docs/design/redesign-spec.md`. |
| `README.md` | This file. |
| `html/` | The HTML source of every artboard, one file per screen. |

## html/ : screens to build

| File | Screen | Size |
|---|---|---|
| `01-home.html` | Home (phone), with photos | 360 wide |
| `02-dish-voting.html` | Dish page, voting open, with photo; all 14 contenders | 360 wide |
| `03-dish-ranked.html` | Dish page, ranked: top-3 podium and full ranking | 360 wide |
| `04-rate-places.html` | Rate the places you know (rating mode): default, saved with Undo, and rated-earlier rows | 360 wide |
| `05-rating-success.html` | Rating success, with share | 360 wide |
| `06-restaurant.html` | Restaurant page: "What to order at X" | 360 wide |
| `07-home-desktop.html` | Home on desktop, with the desktop top bar | 1440 wide, fluid |
| `08-share-link-ranked.html` | Share image, link preview, ranked list (podium) | 1200 × 630 |
| `09-share-status-ranked.html` | Share image, WhatsApp status, ranked list (podium) | 1080 × 1920 |
| `10-share-link-voting.html` | Share image, link preview, voting open (no podium), no-photo version | 1200 × 630 |
| `11-share-status-voting.html` | Share image, WhatsApp status, voting open (no podium), no-photo version | 1080 × 1920 |
| `12-home-no-photos.html` | Home top with no dish photos yet: featured vote card and dish cards as colour tiles, plus one card with a photo for comparison. Top of the page only; the rest matches `01-home.html` | 360 wide |
| `13-dish-voting-no-photo.html` | Dish page top with no photo yet: colour header band carrying the title. Top of the page only; the rest matches `02-dish-voting.html` | 360 wide |

Navigation is not a separate file: the phone tab bar is at the bottom of screens 01, 02, 03, 05 and 06, the rating-mode action bar is at the bottom of 04, and the desktop top bar is at the top of 07.

## html/round-1-not-used/ : do not build

Earlier directions that were considered and set aside. They are included only so the package holds every artboard from the canvas. Their colours, fonts and layouts are not part of this redesign.

| File | Direction |
|---|---|
| `c-dastarkhwan-home.html`, `c-dastarkhwan-dish.html` | C · Dastarkhwan: soft colour tiles, round plates |
| `d-chaska-home.html`, `d-chaska-dish.html` | D · Chaska: photo feed |
| `e-muqabla-home.html`, `e-muqabla-dish.html` | E · Muqabla: bright contest board |

Direction B was deleted from the canvas during the review and is not in this package.

## Notes on the HTML

- Each file opens on its own in a browser. All styles are inline; the only external request is Google Fonts (Bricolage Grotesque, Figtree, and Noto Nastaliq Urdu for the Urdu wordmark). Without a connection the layout holds and system fonts are used.
- Phone screens are 360px wide and show the full scroll length. The tab bar sits at the end of the page in these files; in the build it is fixed to the bottom of the screen.
- These files are static reference, not production code: no scripts, and the controls do nothing. Links between screens work inside this folder.
- The canvas editor's wrapper tags were removed so the files open standalone. Markup and inline styles are otherwise the same as on the canvas.
- Striped blocks labelled "Photo: chicken karahi" are placeholders for real dish photos. Flat colour tiles with a line glyph are the designed no-photo state, not placeholders.
- All restaurant names and numbers are invented sample data ("Sample Karahi House", "Demo Dhaba"). Do not ship them.
- In the mock-ups the Urdu wordmark is set with a webfont. In the build it ships as an SVG inside the logo, so the site loads only two font families.
