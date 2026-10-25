# 07 — Data pipelines

How restaurants and (restaurant, dish) links get into the system.

Restaurants come from two sources, and an admin confirms every one before it is public (CLAUDE.md rule 2, ADR-13):
- Overture Maps places, staged by `pnpm overture:sync` (§1) and reviewed on /admin/import (§2);
- restaurants added by hand on /admin/restaurants/new for places Overture misses.

(restaurant, dish) links come from four sources, in order of trust:

| Source | Creates | Confidence | Status |
|---|---|---|---|
| Owner (claimed) | RestaurantDish | 1.0 | OWNER_VERIFIED |
| Menu photo → vision → matching | RestaurantDish | 0.85–1.0 auto, else review | MENU_VERIFIED |
| User rating / "add dish" | RestaurantDish | 0.5 | CANDIDATE → USER_CONFIRMED at 3 raters |
| Admin ticks a dish (/admin/import Create, /admin/restaurants/new) | RestaurantDish, source ADMIN | 0.4 | CANDIDATE |

## 1. Restaurant candidates from Overture Maps (`pnpm overture:sync`)

**Purpose**: a starting list of restaurants per area for an admin to review, so the panel knows where to go and the rate flow has restaurants to pick. It never ranks anything.

**Rules** (owner decision 2026-10-25, ADR-13; coverage and quality in `docs/research/overture-coverage.md`):
- No Google Places, ever: Google's Maps Platform Terms 3.2.3(d)(iii) forbid the Places API "in a listings or directory service". The only Google service left is the sign-in (OAuth).
- Only Overture records whose every whole-record source is Meta or Microsoft, licence CDLA Permissive 2.0. AllThePlaces records are left out (scraped data, CLAUDE.md rule 1), and so are Foursquare's (Apache 2.0 notice duties).
- The sync fills only the staging table `OvertureCandidate`. A restaurant exists only after an admin creates it on /admin/import (§2), where the form may be prefilled from Overture.
- Credit: the public page /about/data, linked from the footer, shows Overture's credit lines word for word with the licence text linked (https://cdla.dev/permissive-2-0/):
  > Overture Maps Foundation, overturemaps.org (release 2026-10-21.0, accessed 2026-10-25).
  > Data from Meta. Available under CDLA Permissive 2.0.
  > Data from Microsoft. Available under CDLA Permissive 2.0.

  The release is the newest one synced successfully, and the date is the day it was first synced (`JobRun` "overture-sync"). Before any sync the page shows the research report's release and date, as above.

**The command**: `pnpm overture:sync -- --city=islamabad|rawalpindi|all [--release=latest] [--margin-km=5] [--refresh]` (`scripts/overture-sync.ts`; pure rules in `src/server/services/overture/places.ts`):
1. Release: `latest` reads Overture's STAC catalog; an explicit release looks like `2026-10-21.0`.
2. Download: DuckDB (`@duckdb/node-api`, a dev dependency, CLI only) copies the places of the release that lie inside a box around every seed area centre, plus the margin, from Overture's public S3 bucket into `tmp/overture/places-<release>-<box>.parquet`. This happens once per release and box; `--refresh` downloads again. The download code is shared with `pnpm research:overture` (`scripts/lib/overture.ts`).
3. Filter: a candidate must pass all of these:
   - food and drink: `taxonomy.hierarchy[1] = food_and_drink`, without the alcohol branch;
   - every whole-record source is Meta or Microsoft under CDLA-Permissive-2.0;
   - it has a name;
   - it is not `permanently_closed`;
   - the nearest seed area centre is within the margin (default 5 km). That area's city is the candidate's city.
4. Clean:
   - Google links are removed from the address, as are links to any google.* host, goo.gl, g.page, g.co and share.google (e.g. Maps short links). Literal `\n` escapes and links glued to the word before them count as word breaks.
   - The website is the first http(s) website that is not a Google link.
   - The phone is the first one our phone format accepts, normalised.
5. Location unknown: some points are geocoder fallbacks rather than locations. A point (rounded to 4 decimals, about 10 m) with at least 10 places, most of them with different addresses, is one; this is counted over all places in the box. A place on such a point gets no coordinates and no suggested area, and its city comes from the point. Every other place keeps Overture's coordinates.
6. Suggested area: the nearest seed area centre within 1.5 km, else none ("No area suggested" on /admin/import).
7. Stage: a GERS id not yet in `OvertureCandidate` is inserted as `NEW`, with `release` set to this release. An existing row keeps its data and its review state; only `lastSeenRelease` moves forward when this release is newer. Overture ids churn between releases (11.9% in 2026-10-21.0), so the same place can come back under a new id as `NEW`; /admin/import then flags it as a likely duplicate of the earlier candidate or of the restaurant made from it (§2).
8. Every run writes a `JobRun` named `overture-sync`. Its summary has the release, the filter counts and, per city: candidates in the release, inserted, already staged, last seen updated, with or without an area, location unknown, and likely duplicate pairs.

Rerun it after each monthly Overture release. Overture's confidence and categories only order the review list and suggest dishes; they never touch a ranking.

## 2. Admin review (`/admin/import`)

1. Pick a city (links), an area and a view. Each area shows the number of places left to review; there is also "No area suggested". The views are To review, Skipped, and Created or linked. The default area is the one with the most places left. Candidates are listed by Overture's confidence, highest first, at most 300 at a time. Overture recommends no threshold, so none is applied.
2. Each row shows:
   - name, confidence and categories; address, phone and website;
   - Overture's coordinates, or "location unknown", and the suggested area;
   - "not in the latest Overture release" when a newer sync no longer had the place;
   - the source, and the dish hints (see Create below);
   - likely duplicates, at most 3 of each kind:
     - our restaurants of the city (not merged) within 50 m whose name or other name is similar. Similar means: equal after keeping only letters and digits, lowercase; or Jaro-Winkler ≥ 0.9; or, when both names have at least 4 characters, one contains the other. When either side has no location, the rule is stricter: an equal name or Jaro-Winkler ≥ 0.9, in the candidate's suggested area (in the whole city when it has none);
     - other candidates of the city within 50 m with a similar name, with their status and the restaurant they became.
3. **Create** opens the restaurant form, prefilled from Overture with the name, address, phone and website. The admin:
   - fixes the name to the signboard spelling;
   - checks the address and the area (default: the suggested area; any area of either city);
   - may add a price band and other names;
   - ticks the launch dishes it serves. These are pre-ticked:
     - every launch dish with an alias that appears in the name as whole words (docs/05 normal form). "nashta" is ignored, and so is "mandi" after sabzi, bakra, namak… or before road, more, station…;
     - both Chicken Karahi and Mutton Karahi for a bare "karahi" (kadai, karhai…);
     - from Overture categories: pizza_restaurant → Pizza, burger_restaurant → Beef Burger, tea_room → Chai.

   The restaurant gets `source OVERTURE`, `overtureId` (the GERS id), and Overture's coordinates with `locationSource OVERTURE`. A location-unknown place gets no coordinates; the admin adds them later on the restaurant page. Each ticked dish becomes `RestaurantDish CANDIDATE, source ADMIN, confidence 0.4`; an existing row of any status is left as it is. The candidate becomes `CREATED`.
4. **Link** works from a duplicate shown on the row (one click) or any restaurant found by name. The restaurant takes the candidate's GERS id when it has none, and Overture's coordinates when it has no location; nothing else changes. The candidate becomes `LINKED`.
5. **Skip** takes an optional reason (closed, duplicate, not a restaurant) and makes the candidate `SKIPPED`. **Reopen** puts it back to `NEW`.
6. Every action:
   - locks the candidate row and works only on a `NEW` candidate (else `CANDIDATE_REVIEWED`, 409; Reopen works only on `SKIPPED`);
   - records `reviewedByUserId` and `reviewedAt`;
   - is limited by `user:{id}:admin-write`;
   - logs ids only.

   Links to our restaurants open in a new tab, so the list keeps its place.

Goal: about 40 places reviewed in 15 minutes.

**Places Overture misses**: /admin/restaurants/new ("Add restaurant") is the same form, empty, with an optional latitude and longitude (`locationSource ADMIN`). It sets `source MANUAL`.

**Coordinates later**: on /admin/restaurants/[id] an admin can type or clear the coordinates at any time. Changed coordinates become `locationSource ADMIN`, unchanged ones keep their source, and cleared ones mean location unknown. A restaurant's own coordinates (Overture or admin) are public data and drive the distance features (docs/04, docs/06).

### Merging duplicate restaurants (`RestaurantService.merge(sourceId, targetId)`)

Admin-only (`PATCH /api/v1/admin/restaurants/:id { mergeIntoId }` or the merge dialog). Everything runs in one database transaction; any failure rolls all of it back. It locks both restaurants, then the (city, dish) lists of their dishes, then their dish rows (docs/02 Concurrency). When one user rated both rows, the rating dropped into history no longer counts in their `ratingsCount` (and `photoRatings`). Held-rating items of a dropped row move to the kept row: an open one joins the kept row's open item of the same reason (and is closed as "merged into …"), every other one simply points at the kept row.

1. Dishes: a source `RestaurantDish` whose dish the target lacks moves to the target. When both serve the dish, keep the stronger row (status order OWNER_VERIFIED > MENU_VERIFIED > USER_CONFIRMED > CANDIDATE > STALE > REMOVED; tie → more distinct raters), give it the lower non-null price and the union of `variantTags`, move the other row's ratings and flags onto it, then delete the other row.
2. Ratings: one per user per kept row. When the same user rated both rows, keep the rating with the newer `updatedAt`; append the older rating (score, comment, createdAt) to the kept rating's `RatingHistory`, move the older rating's own history rows over, then delete the older `Rating`.
3. Flags move to the kept row; a flag is dropped when the same user already flagged that row for the same reason.
4. Menu uploads, owner claims and open review items of the source move to the target; a claim by a user who already claimed the target is dropped. If both restaurants are claimed by different owners, the merge stops with `MERGE_CONFLICTING_OWNERS`; if only the source is claimed, its owner moves to the target.
5. Overture id and location: the target keeps its own. When it has no `overtureId`, it takes the source's, which is cleared on the source first because the column is unique. When it has no location, it takes the source's `lat/lng` with their `locationSource`. Candidates created from or linked to the source then point at the target. Restaurants of different cities cannot be merged (`MERGE_CITY_MISMATCH`).
6. Source: `status = DUPLICATE`, `mergedIntoId = target`. Its URLs redirect permanently to the surviving restaurant (docs/06), following `mergedIntoId` chains.
7. After commit: `recomputeOne` for every kept row whose ratings changed and a re-rank of the target's lists, then `revalidatePath` for both restaurant pages and the affected ranking pages. Log one line with every moved, merged and dropped id. Ratings are moved with plain SQL, so their `updatedAt` (the decay clock) does not change.

## 3. Menu ingestion (photo → structured menu)

**Who**: panel member or owner uploads from the restaurant page ("Upload menu photo"); admin can upload too.

1. Client: resize to ≤ 1600 px and re-encode (strips EXIF/GPS), `POST /api/v1/uploads/sign` → PUT to the private `menus` bucket at `menus/<restaurantId>/<cuid>.jpg` → `POST /owner/restaurants/:id/menus` (or server action) → `MenuUpload PENDING`.
2. Parse (`MenuService.parse(uploadId)`), triggered by admin button, `scripts/parse-menu.ts`, or the nightly cron for PENDING uploads ≤ 20/night:
   - Download image; call Anthropic Messages API (model from `ANTHROPIC_VISION_MODEL`) with a **tool** `extract_menu` whose input schema is:
     ```json
     { "sections": [ { "name": "string", "items": [ { "name": "string", "price": "integer|null", "note": "string|null" } ] } ] }
     ```
   - System prompt (verbatim in `src/server/vision/parseMenu.ts`):
     > You read a photo of a restaurant menu from Pakistan. Return every food/drink item exactly as printed, with its PKR price as an integer if visible. Keep section headings. Do not translate, do not guess items that are not visible, do not merge sizes (if Half and Full have prices, output two items "X Half" and "X Full"). Prices like 1,850/- are 1850. Return nothing else.
   - Store `rawJson`; create `MenuItem` rows (`rawName`, `rawPrice`, `rawSection`).
   - Run matching (docs/05) per item. For matches with conf ≥ 0.85: upsert `RestaurantDish` → `status MENU_VERIFIED, source MENU_PHOTO, confidence = conf, menuName = rawName, price = min price across size variants, variantTags, lastVerifiedAt = now()`. Lower conf → `ReviewItem UNMATCHED_MENU_ITEM`.
   - `MenuUpload.status = PARSED` (or `FAILED` with error).
3. Admin reviews the upload page: items grouped as matched / needs review / ignored. Resolving a review item can **Assign dish**, **Create dish** (admin only, from DISH_PROPOSAL flow), or **Ignore** (e.g. "Raita").
4. When all items are resolved → `MenuUpload.status = REVIEWED`.

Cost: one menu photo ≈ 1–2k input tokens + a few hundred output tokens — a few cents. Keep `ANTHROPIC_VISION_MODEL` configurable.

## 4. Owner claim

1. Owner (any signed-in user) submits claim: restaurant, phone, proof note (e.g. "Call the number on our Facebook page").
2. `ReviewItem OWNER_CLAIM` → admin verifies by calling the restaurant / checking the official page → **Approve** sets `User.role = OWNER` (if USER), `Restaurant.claimedByUserId`, `OwnerClaim.APPROVED`, and blocks that user from rating that restaurant's dishes. **Reject** with reason.
3. Approved owner can: confirm dishes (→ `OWNER_VERIFIED`), remove dishes (→ `REMOVED`, logged), fix menu names/prices, upload menus, view the basic report.
4. Owners cannot see who rated, cannot edit or hide ratings, cannot change scores.

## 5. Freshness and hygiene jobs (nightly recompute, docs/04)

- Stale marking by status age.
- `Rating` comments with a phone number, link or e-mail address → the whole rating is HELD with a `SUSPICIOUS_RATINGS` item (reason `COMMENT`), checked at write time in RatingService (Decided 2026-10-26, docs/04 abuse control 5); a nightly sweep as backup arrives with the nightly job (Phase 4).
- Trust recompute.
- Weekly `RankingSnapshot`.
- `JobRun` rows for every job; admin dashboard shows last 10 runs.

## 6. Review queue — payloads and resolutions

| type | payload | admin actions |
|---|---|---|
| `UNMATCHED_MENU_ITEM` | `{ menuItemId, rawName, rawPrice, suggestions: [{dishSlug, conf}] }` | assign dish (→ RD MENU_VERIFIED) · ignore · create dish then assign |
| `DISH_PROPOSAL` | `{ name, note, restaurantId }` (`restaurantId` null when the diner was not rating anywhere) | create dish (slug, category, aliases; not a launch dish) · map to existing dish · reject |
| `RESTAURANT_PROPOSAL` | `{ name, cityId, areaId, note }` | create restaurant (source MANUAL, the admin types the fields; optional location and dishes) · link to existing · reject |
| `FLAG` | `{ restaurantDishId, reason, flagIds[] }` | uphold (NOT_SERVED ×3 upheld → RD REMOVED; RESTAURANT_CLOSED → Restaurant CLOSED) · dismiss |
| `SUSPICIOUS_RATINGS` | `{ restaurantDishId, ratingIds[], reason: "BURST" \| "COMMENT", flags? }` (`flags` = what the comment screen found: PHONE, LINK, EMAIL, BLOCKLIST). One OPEN item per dish row and reason; later held ratings join it. A BURST item lists every qualifying rating, also one already held for its comment. A release records the ids it set ACTIVE as `releasedRatingIds` | release (HELD ratings → ACTIVE, except ones still listed in another open item; the released ones are never held again by the burst rule) · hide (HIDDEN; the user's trust is recomputed from the docs/04 table, where ≥ 2 hidden gives 0.3) · ban users (bannedAt, all their ratings HIDDEN) |
| `LOCATION_SUGGESTION` | `{ restaurantId, observationIds[], best: { observationId, lat, lng, accuracyM }, current: { lat, lng, source } \| null, distanceM }` (§7) | approve (the restaurant takes `best`, `locationSource PANEL_GPS`) · reject |
| `OWNER_CLAIM` | `{ claimId, phone, proofNote }` | approve · reject |
| `DUPLICATE_RESTAURANT` | `{ restaurantIdA, restaurantIdB, similarity }` | merge B into A (rules in §2) · keep both |

Every resolution writes `resolvedByUserId`, `resolution`, `resolvedAt`, and triggers `recomputeOne` where ratings changed. A decision is refused (`ITEM_CHANGED`) when the item changed after the admin opened it, so it never applies to ratings, comments or a location they did not see. A status change of a rating never moves its `updatedAt` (the decay clock, docs/04). Phase 3 builds the decisions for `SUSPICIOUS_RATINGS`, `DISH_PROPOSAL`, `RESTAURANT_PROPOSAL` and `LOCATION_SUGGESTION` on `/admin/review`; the other types arrive with their phases.

## 7. Panel operations (non-code, but the plan depends on it)

- Recruit 8–12 panel members; admin sets `isPanel` on `/admin/users` (trust fixed at 1.3; 30 ratings/day, 10 per restaurant per day; no new-account burst hold; still blocked from restaurants they own).
- On-site locations: on the rating screen a panel member can tap "I'm at this restaurant now – share location"; the browser asks for permission each time. The location is kept as a `LocationObservation` (never on the rating), and only when the browser reports an accuracy of 50 m or better. When the restaurant has no location, or the observation is more than 150 m away (DECISION-PENDING), one OPEN `LOCATION_SUGGESTION` item collects the observations; accepting it sets the most accurate one with `locationSource PANEL_GPS`. Observations follow their restaurant into a merge.
- Week 1–2 target: every launch dish has ≥ 10 restaurants with ≥ 4 panel ratings each in Islamabad → bootstrap-mode eligibility.
- Panel uploads a menu photo at each visit (one tap on the restaurant page).
- Weekly 20-minute review session: clear the review queue, merge duplicates.
