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
   - the nearest seed area centre is within the margin (default 5 km). The candidate's city is its suggested area's city (step 6), else that nearest centre's city.
4. Clean:
   - Google links are removed from the address, as are links to any google.* host, goo.gl, g.page, g.co and share.google (e.g. Maps short links). Literal `\n` escapes and links glued to the word before them count as word breaks.
   - The website is the first http(s) website that is not a Google link.
   - The phone is the first one our phone format accepts, normalised.
5. Location unknown: some points are geocoder fallbacks rather than locations. A point (rounded to 4 decimals, about 10 m) with at least 10 places, most of them with different addresses, is one; this is counted over all places in the box. A place on such a point gets no coordinates and no suggested area, and its city comes from the point. Every other place keeps Overture's coordinates.
6. Suggested area (owner, 2026-11-04): each seed area has its own radius (`radiusKm` in `seed/areas.json`, `Area.radiusKm`; default 1.5 km, larger for big areas such as Bahria Town and DHA). Among the areas whose radius covers the point, the one it lies deepest inside (the smallest distance as a share of the radius) is suggested; none covers it → none ("No area suggested" on /admin/import).
7. Stage: a GERS id not yet in `OvertureCandidate` is inserted as `NEW`, with `release` set to this release. When this release is newer than a row's `lastSeenRelease`:
   - a `NEW` (unreviewed) row is refreshed from it: name, address, phone, website, location (with its city and suggested area), categories, confidence and sources; `release` becomes this release;
   - a reviewed row (`CREATED`, `LINKED`, `SKIPPED`) is never changed, apart from `lastSeenRelease`;
   - a refresh writes only while the row is still `NEW`, so a review that happens meanwhile wins.

   Overture ids churn between releases (11.9% in 2026-10-21.0), so the same place can come back under a new id as `NEW`; /admin/import then flags it as a likely duplicate of the earlier candidate or of the restaurant made from it (§2).
8. Place again: every run then places every `NEW` candidate with a location again (city and suggested area) with the seed areas as they are now. `pnpm overture:sync -- --city=all --areas-only` does only this, without a download, e.g. after changing a radius in `seed/areas.json` and running `pnpm db:seed`.
9. Every run writes a `JobRun` named `overture-sync` (`overture-sync-areas` for `--areas-only`). Its summary has the release, the filter counts and, per city: candidates in the release, inserted, already staged, refreshed, last seen updated, with or without an area, location unknown, likely duplicate pairs, and the NEW candidates with and without an area after placing them again.

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

**Who**: panel members, the restaurant's owner (its `claimedByUserId`) and admins upload from the restaurant page ("Upload menu photo", shown only to them: the static page asks the server, `menuUploadAccessAction`). Never a banned account, only for an ACTIVE restaurant; checked again on the server at every step (`src/server/services/menu-access.ts`).

1. Upload (`MenuService.submit`):
   - The browser resizes to ≤ 1600 px and re-encodes (WebP, JPEG where WebP is missing), which strips EXIF/GPS.
   - `POST /api/v1/uploads/sign` `{ kind: "menu", restaurantId, … }` (or the server action) → a 10-minute presigned `PUT` into the private `menus` bucket at `<restaurantId>/<random>.(jpg|webp)` (no user id since Phase 6; the `Upload` row records the signer); the path is `menus/<that key>`.
   - Then `submitMenuUploadAction { restaurantId, path }` → `MenuUpload PENDING`, after checking the path's `Upload` row is this user's, signed for a menu of this restaurant, and the object exists, is ≤ 5 MB and JPEG or WebP. `filePath` is unique.
   - Limits: `user:{id}:upload` (20/day, shared with dish photos) at signing, `user:{id}:menu-upload` (10/day) at submitting.
2. Parse (`parseMenuUpload(uploadId)` in `src/server/services/menu.service.ts`), for a PENDING or FAILED upload. Triggers: **Parse now** on `/admin/menus/[id]`, `pnpm menu:parse -- --upload=<id>`, and the nightly `/api/cron/parse-menus` (01:00 PKT, an hour before the recompute: up to 20 PENDING uploads, oldest first, none started after 120 s, stops at the cap).
   - **Refusals, before any API call**:
     - `PARSING_DISABLED` (503) without both `ANTHROPIC_API_KEY` and `ANTHROPIC_VISION_MODEL`; uploads still work and wait;
     - `UPLOADS_DISABLED` (503) without storage;
     - `MENU_ALREADY_PARSED` and `PARSE_RUNNING` (409);
     - `DAILY_CAP_REACHED` (429): at most **50 parses start in any 24 hours** (all triggers), counted from `MenuParse` rows under one advisory lock.
   - **Every attempt is a `MenuParse` row**: trigger, model, vision input/output tokens, matcher LLM calls and their tokens, ok or the error.
   - **The model call**: the server downloads the photo and sends the Anthropic Messages API (`ANTHROPIC_VISION_MODEL`) **only the image (base64, before the text) and the system prompt below**, never the restaurant, the uploader or anything else. Structured output (`output_config.format`, effort low) with this schema:
     ```json
     { "sections": [ { "name": "string", "items": [ { "name": "string", "price": "integer|null", "note": "string|null", "roman": "string|null" } ] } ] }
     ```
     The original plan was a forced `extract_menu` tool, but current Claude models reject forced `tool_choice` (as for docs/05 step 5).
   - **System prompt** (verbatim in `src/server/vision/parseMenu.ts`):
     > You read a photo of a restaurant menu from Pakistan. Return every food/drink item exactly as printed, with its PKR price as an integer if visible. Keep section headings. Do not translate, do not guess items that are not visible, do not merge sizes (if Half and Full have prices, output two items "X Half" and "X Full"). Prices like 1,850/- are 1850. If an item name is not written in Latin letters (for example Urdu), keep it as printed in "name" and also give its Roman-Urdu spelling in lowercase in "roman" (for example "chicken karahi" for چکن کڑاہی); otherwise "roman" is null. Return nothing else.

     Urdu-script menus (owner, 2026-11-04): the printed name is kept in `MenuItem.rawName` and the Roman spelling in `romanName`; matching uses the Roman spelling when the printed name has letters outside the Latin script (`matchingName` in `src/server/vision/menu-items.ts`), because `normalize()` keeps Latin letters and digits only.
   - **Answers that fail**: a cut-off (`max_tokens`) or refused answer fails with the tokens it cost. The SDK retries a failed request once.
   - **Items**: store `rawJson`, then create `MenuItem` rows in menu order (`position`, `rawName`, `romanName`, `rawPrice`, `rawSection`, at most 300). Prices are parsed leniently: `1,850/-`, `Rs. 2,200` and Urdu digits all work; two prices in one, or anything else, become no price. Sizes stay separate items, and the matcher strips the size words.
   - **Matching** (docs/05) per item, outside any transaction. The LLM step uses `ANTHROPIC_MATCH_MODEL`, at most 25 calls per parse; later items go to review with their suggestions.
   - **One transaction**, restaurant share-locked:
     - each dish matched at ≥ 0.85 gets a RestaurantDish created (source `MENU_PHOTO`) or upgraded to `MENU_VERIFIED`, with `confidence` (the higher one), `menuName` = the first item's name, `price` = the lowest price of its items (Half below Full), `variantTags` = its items' tags and `lastVerifiedAt = now()`;
     - an existing row keeps its source; an `OWNER_VERIFIED` row keeps the owner's name, price and tags and only gets `lastVerifiedAt`; a `REMOVED` row stays removed (only an admin revives one);
     - lower confidence → `MenuItem NEEDS_REVIEW` plus a `ReviewItem UNMATCHED_MENU_ITEM` (payload in §6);
     - `MenuUpload.status = PARSED`, or `REVIEWED` straight away when nothing needs review.
   - **After commit**: the changed rows are recomputed (`MENU_VERIFIED` confirms a dish row for eligibility, docs/04) and their pages revalidated.
   - **Failure**: storage, the API, no items in the photo, or a merge meanwhile → `FAILED` with the error, which the admin can parse again.
3. Admin review: `/admin/menus` lists uploads by status (waiting, to review, failed, done) with the day's parse count. `/admin/menus/[id]` shows the photo (a 10-minute signed link to the private bucket) next to its items, grouped matched / needs review / ignored, with the parse attempts and their tokens. A waiting item is decided through the review queue (§6):
   - **one tap on a suggestion** assigns it;
   - **Other dish…** assigns any dish;
   - **Create dish…** (admin only) creates a dish and assigns it;
   - **Ignore** (e.g. "Raita").

   `/admin/review` shows the same items under "Menu items".
4. When no item of the upload waits any more → `MenuUpload.status = REVIEWED` (the upload row is locked, so this happens exactly once).

Cost: a 1600 px photo is ≈ 2.5–3k input tokens and a few hundred output tokens, about a cent on a Sonnet-class model. The real check on 2026-11-04 (synthetic 16-item menu, claude-sonnet-5-5) used 2,868 input + 490 output tokens for the photo and one matcher call of 550 + 78. Keep `ANTHROPIC_VISION_MODEL` configurable.

## 4. Owner claim

1. Any signed-in, unbanned user opens "Is this your restaurant?" on an ACTIVE, unclaimed restaurant page and sends a phone number and a proof note (e.g. "Call the number on our Facebook page") → `OwnerClaim PENDING` + `ReviewItem OWNER_CLAIM` (`claimRestaurantAction`, `src/server/services/claim.service.ts`). The same person's pending claim of the same restaurant files nothing new; a restaurant someone manages already answers `409 RESTAURANT_CLAIMED` (the dispute page is the way to contest it). Limit `user:{id}:claim` 3/day. /me lists the user's claims with their status.
2. On /admin/review the admin verifies by calling the restaurant's own number or checking its official page, then:
   - **Approve**: `Restaurant.claimedByUserId` and `claimedAt` are set, `OwnerClaim` becomes APPROVED (with `reviewedByUserId`, `reviewedAt`), a USER becomes OWNER (an ADMIN keeps ADMIN). That user can no longer rate the restaurant, and their earlier ratings there stop counting (docs/04 control 1; the rows are recomputed). The restaurant row is locked first, so a rating in flight finishes before and every later one sees the owner.
   - **Reject** with a reason (required), shown to the claimant on /me.
3. The owner area, `/owner` (OWNER or ADMIN; an owner opens only restaurants whose `claimedByUserId` is theirs, anything else answers 404; an admin may open any), `src/server/services/owner.service.ts`:
   - **Confirm** a dish (`CANDIDATE`, `USER_CONFIRMED`, `MENU_VERIFIED` or `STALE` → `OWNER_VERIFIED`, `lastVerifiedAt` now).
   - **Fix the name and price** on their menu: `menuName` (≤ 120) and `price` (PKR), which also makes it `OWNER_VERIFIED`, so a later menu photo never overwrites them (§3).
   - **Remove** a dish they do not serve (→ `REMOVED`, logged as `owner.dish.remove` with the optional reason); only an admin brings it back.
   - **Upload menus** (the same button as on the restaurant page).
   - **Report**: per dish its status, score, votes and city rank now, and its rank, score and votes in each weekly `RankingSnapshot` of the last 12 weeks ("not ranked" when it was not in that week's top 50).

   Every change share-locks the restaurant, then the row, and recomputes the row after commit (its status decides eligibility); limit `user:{id}:owner-write` 200/hour.
4. Owners cannot see who rated, cannot edit or hide ratings, cannot change scores, and cannot rate their own restaurant; their ratings given there before the claim stop counting (docs/04 control 1).
5. **Remove owner** (2026-11-04): on /admin/restaurants a claimed restaurant shows its owner (name and e-mail) and "Remove owner", which needs a reason (≤ 500, logged as `admin.restaurant.owner_remove` with it; `removeRestaurantOwnerAction`, `removeRestaurantOwner` in `claim.service.ts`). `claimedByUserId` and `claimedAt` are cleared; the user loses the OWNER role when they manage no other restaurant (any status but DUPLICATE; an ADMIN keeps ADMIN), and the normal rating rules apply to them again: they may rate it, and their earlier ratings there count again (the rows are recomputed). The restaurant row is locked first, then the user's row (an approval takes the same order), so a rating in flight finishes before, and a removal and an approval for the same user never leave them managing a restaurant without the role. The owner the page showed is sent along: another owner by then answers `409 ITEM_CHANGED`, no owner `409 NOT_CLAIMED`. Their approved claim stays APPROVED (/me says they no longer manage the restaurant), dish rows they confirmed stay OWNER_VERIFIED, and anyone may claim the restaurant again.

## 5. Freshness and hygiene jobs (nightly recompute, docs/04)

- Stale marking by status age.
- `Rating` comments with a phone number, link or e-mail address → the whole rating is HELD with a `SUSPICIOUS_RATINGS` item (reason `COMMENT`), checked at write time in RatingService (Decided 2026-10-26, docs/04 abuse control 5); a nightly sweep as backup arrives with the nightly job (Phase 4).
- Trust recompute.
- Weekly `RankingSnapshot`.
- `JobRun` rows for every job; admin dashboard shows last 10 runs.

## 6. Review queue — payloads and resolutions

| type | payload | admin actions |
|---|---|---|
| `UNMATCHED_MENU_ITEM` | `{ menuItemId, menuUploadId, rawName, romanName, rawPrice, rawSection, suggestions: [{dishSlug, conf}] }` (`createdByUserId` = the uploader; the MenuItem links back through `reviewItemId`) | assign dish (the item becomes MATCHED, method HUMAN 1.0; the RD becomes MENU_VERIFIED from the upload's items of that dish, §3) · ignore (item IGNORED) · create dish then assign. The last decided item of an upload makes it REVIEWED |
| `DISH_PROPOSAL` | `{ name, note, restaurantId }` (`restaurantId` null when the diner was not rating anywhere) | create dish (slug, category, aliases; not a launch dish) · map to existing dish · reject |
| `RESTAURANT_PROPOSAL` | `{ name, cityId, areaId, note }` | create restaurant (source MANUAL, the admin types the fields; optional location and dishes) · link to existing · reject |
| `FLAG` | Phase 4: `{ kind: "report", restaurantId, reason: CLOSED\|WRONG_LOCATION\|WRONG_DISH\|OTHER, dishId, note }` ("Report a problem", signed in) or `{ kind: "dispute", message, contact, page }` (/dispute, anyone). Phase 5 adds `{ restaurantDishId, reason, flagIds[] }` (Flag rows) | Phase 4: uphold = "Done (acted on it)": the admin makes the fix by hand (restaurant status, location, dish row) and the item is RESOLVED · dismiss (REJECTED). Phase 5, Flag rows: uphold (NOT_SERVED ×3 upheld → RD REMOVED; RESTAURANT_CLOSED → Restaurant CLOSED) · dismiss |
| `SUSPICIOUS_RATINGS` | `{ restaurantDishId, ratingIds[], reason: "BURST" \| "COMMENT", flags? }` (`flags` = what the comment screen found: PHONE, LINK, EMAIL, BLOCKLIST). One OPEN item per dish row and reason; later held ratings join it. A BURST item lists every qualifying rating, also one already held for its comment. A release records the ids it set ACTIVE as `releasedRatingIds` | release (HELD ratings → ACTIVE, except ones still listed in another open item; every rating of a released BURST item is cleared of the burst rule, also one that stays HELD for its comment) · hide (HIDDEN; the user's trust is recomputed from the docs/04 table, where ≥ 2 hidden gives 0.3) · ban users (bannedAt, all their ratings HIDDEN) |
| `LOCATION_SUGGESTION` | `{ restaurantId, observationIds[], best: { observationId, lat, lng, accuracyM }, current: { lat, lng, source } \| null, distanceM }` (§7) | approve (the restaurant takes `best`, `locationSource PANEL_GPS`) · reject |
| `OWNER_CLAIM` | `{ claimId, phone, proofNote }` (`createdByUserId` = the claimant) | approve (claimedByUserId, role OWNER for a USER, earlier ratings stop counting) · reject (reason required, shown on /me) |
| `DUPLICATE_RESTAURANT` | `{ restaurantIdA, restaurantIdB, similarity }` | merge B into A (rules in §2) · keep both |

Every resolution writes `resolvedByUserId`, `resolution`, `resolvedAt`, and triggers `recomputeOne` where ratings changed. A decision is refused (`ITEM_CHANGED`) when the item changed after the admin opened it, so it never applies to ratings, comments or a location they did not see. A status change of a rating never moves its `updatedAt` (the decay clock, docs/04). Phase 3 builds the decisions for `SUSPICIOUS_RATINGS`, `DISH_PROPOSAL`, `RESTAURANT_PROPOSAL` and `LOCATION_SUGGESTION` on `/admin/review`, Phase 4 those for `FLAG` reports and disputes, Phase 5 those for `UNMATCHED_MENU_ITEM`; the other types arrive with their phases.

## 7. Panel operations (non-code, but the plan depends on it)

- Recruit 8–12 panel members; admin sets `isPanel` on `/admin/users` (trust fixed at 1.3; 30 ratings/day, 10 per restaurant per day; no new-account burst hold; still blocked from restaurants they own).
- On-site locations: on the rating screen a panel member can tap "I'm at this restaurant now – share location"; the browser asks for permission each time. The location is kept as a `LocationObservation` (never on the rating), and only when the browser reports an accuracy of 50 m or better. When the restaurant has no location, or the observation is more than 150 m away (DECISION-PENDING), one OPEN `LOCATION_SUGGESTION` item collects the observations; accepting it sets the most accurate one with `locationSource PANEL_GPS`. Observations follow their restaurant into a merge.
- Week 1–2 target: every launch dish has ≥ 10 restaurants with ≥ 4 panel ratings each in Islamabad → bootstrap-mode eligibility.
- Panel uploads a menu photo at each visit (one tap on the restaurant page).
- Weekly 20-minute review session: clear the review queue, merge duplicates.
