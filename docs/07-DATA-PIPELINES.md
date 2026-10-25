# 07 — Data pipelines

How restaurants and (restaurant, dish) links get into the system. Four sources, in order of trust:

| Source | Creates | Confidence | Status |
|---|---|---|---|
| Owner (claimed) | RestaurantDish | 1.0 | OWNER_VERIFIED |
| Menu photo → vision → matching | RestaurantDish | 0.85–1.0 auto, else review | MENU_VERIFIED |
| User rating / "add dish" | RestaurantDish | 0.5 | CANDIDATE → USER_CONFIRMED at 3 raters |
| Google Places Text Search (live, /admin/import) | RestaurantDish, only after an admin Create or Link | 0.4 | CANDIDATE |

## 1. Finding candidates with Google Places (New)

**Purpose**: a starting list of restaurants per dish per area so the panel knows where to go and the rate flow has restaurants to pick. It never ranks anything.

**Google data rule** (owner decision 2026-10-25; Google Maps Platform Terms 3.2.3(a)(iii), 3.2.3(b) and 3.2.3(c)(iv), and the Places API Service Specific Terms):
- We save only `googlePlaceId` (indefinitely) and `lat/lng` with the time of the Google call (`googleSyncedAt`, at most 30 days, refreshed daily: §5), and only when an admin creates or links a restaurant (§2).
- Google names and addresses are shown to the admin during the search and nowhere else. They are never saved (DB, files, fixtures, logs, caches) and never prefill a form: the admin types name and address.
- Google responses are never cached: every request is sent with `cache: "no-store"`; no `unstable_cache` or `"use cache"`; and `next.config.ts` turns off the dev-only HMR fetch cache (`experimental.serverComponentsHmrCache: false`, which otherwise keeps even no-store responses during `next dev`) and the dev log of Server Function arguments (`logging.serverFunctions: false`, which would print page tokens).
- Google coordinates are never an input for deriving data (no area suggestion, distance check or point-in-polygon from them).
- Google errors are kept as status codes only (`404 NOT_FOUND`): the client never reads Google's error text, so it cannot reach a review item, a log or a terminal.
- Public responses and pages carry no Google coordinates (they are cached for our own use, not re-served: Maps Platform Terms 3.2.3(a)); the admin restaurant page shows a Google Maps link instead of numbers.
- Guard tests: `tests/unit/import/google-data-guard.test.ts` (canary names, addresses and error text must not reach the DB, any file or any log) and `tests/unit/places/google-data-static.test.ts`.

**The query** (`src/server/services/places-query.ts`; the live search and the planning tool send exactly the same one per dish × area):
- `POST https://places.googleapis.com/v1/places:searchText`
- body: `{ textQuery: "<dish name> <area name> <city>", includedType: "restaurant" (omitted for dishes in the categories breakfast, drinks, desserts and street-food), locationRestriction: { rectangle: { low: { latitude, longitude }, high: { latitude, longitude } } }, pageSize: 20, regionCode: "PK", languageCode: "en" }`. The rectangle reaches 3 km north, south, east and west of our own area centre (`seed/areas.json`), so far-away places (a Lahore branch) never come back. `locationRestriction` accepts only a rectangle and cannot be combined with `locationBias`.
- `includedType` only biases results; `strictTypeFiltering` stays false so dhabas and cafés that serve the dish are not lost. The bias still pushes other venues down the list, so chai, halwa puri, dessert and street-food searches send no type: tea stalls and breakfast shops are often typed `cafe`, `tea_house`, `bakery` or nothing.
- next page: resend the same body plus `pageToken: "<nextPageToken>"`; at most 3 pages (Text Search returns at most 60 results). `nextPageToken` must be in the field mask, otherwise the response carries no token and only page 1 comes back.
- field masks: /admin/import `places.id,places.displayName,places.formattedAddress,places.location,places.attributions,nextPageToken` (Text Search Pro: 5,000 free per month, then $32 per 1,000; `places.attributions`, the data providers Google requires to be credited next to a result, is in the IDs Only group at no extra charge); planning tool `places.id,nextPageToken` (Text Search Essentials IDs Only: no charge).

### Planning tool: `pnpm seed:places`

`scripts/seed-places.ts --city=islamabad --dish=chicken-karahi [--areas=f-7,f-8] [--dry-run] [--max-calls=150]`

- Runs the query for each area with the ids-only field mask, up to 3 pages, and prints per area the pages, results and new places (not returned for an earlier area); then the unique places, the calls used and the live-import estimate: the Text Search Pro calls /admin/import needs to load every page of those areas. It never requests names or addresses, writes no file and never writes the DB (it only reads the city, areas and dish).
- `--dry-run` prints the planned queries, their rectangles and the maximum number of calls; no Google call, no API key needed.
- `--max-calls` (default 150) caps HTTP requests, retries included: the client refuses the request that would go over. A missing `GOOGLE_PLACES_API_KEY` stops the run before any call. 429 and 5xx are retried with exponential backoff (3 attempts). A 4xx on an area's first page (bad key, API disabled, invalid request) stops the run, because every other area would fail the same way. Errors are printed as status codes.

Budget for a full live import: at most 3 pages per area, so ≤ 60 Text Search Pro calls per dish for Islamabad (20 areas) and ≤ 30 for Rawalpindi (10 areas); all 19 launch dishes in both cities ≤ 1,710 calls, inside the 5,000 free per month. The limit `global:places-search` (150 per day for all admins together, counted only for valid requests) keeps a month under that cap. The planning tool's ids-only calls cost nothing.

**Policy notes (keep these in the import UI copy)**
- We store `googlePlaceId` forever; `lat/lng` are kept at most 30 days old by the daily `/api/cron/refresh-places` (§5: Place Details, field mask `location`, Essentials, 10,000 free per month).
- Request shapes, field masks, prices and the attribution rules were checked against the Places API (New) Text Search, Place Details, Google Maps URLs, pricing and Places policies pages on 2026-10-25 (pages last updated 2026-10-23).
- Attribution: where Google data is shown (/admin/import only), each result's Google block (name, address, data-provider credits, "Open in Google Maps") carries the official Google Maps logo, apart from our own data (status, duplicates, actions): Google's gray non-outlined logo from `Google_Maps_Attribution_Assets.zip`, unmodified (`public/attribution/google-maps-logo-gray.svg`), 18 px high (policy: 16–19 dp), clear space of 10 px left, right and top and 5 px at the bottom, alt text "Google Maps".
- "Open in Google Maps" links are built from the place id (Google Maps URLs `search` action with `query_place_id`); the required `query` is our own text (dish, area, city), never a Google name.

## 2. Admin import (`/admin/import`)

1. Search: the admin picks a dish and an area (city, then area) and clicks Search. The server sends the §1 query for that dish and area and returns one page of up to 20 results, each with Google's name and address (display only), an "Open in Google Maps" link and the fetch time of that page. "Load more" sends the same query with the page token (at most 3 pages). Every result is shown in Google's order, including results without a location (shown, but not importable). Each page is one billable Text Search Pro call, limited by `global:places-search` (150 per day for all admins). Searching saves nothing.
2. Dedupe per result: a restaurant with the same `googlePlaceId` → "already imported" (with "Add <dish> to it" when it lacks the dish); else our restaurants, in either city, in every area whose centre (our coordinates) lies inside the search rectangle, whose name or another name has trigram similarity ≥ 0.6 with the result's name → "possible duplicate" (with Link buttons; a candidate already linked to another Google place gets a "merge instead" note, because Link would be refused); else "new". The Google name is compared in memory only.
3. Admin actions per result: **Create** opens an empty form, which says so: the admin types the name and address from the signboard, the restaurant's own page or a visit; the area defaults to the searched area and can be changed to any area of either city (a search near the city line can return places in the twin city); phone, price band and other names are optional. Nothing is prefilled from Google. / **Link to existing** (a possible duplicate, or any restaurant found by name) / **Skip** (no write).
4. On Create, or on Link to a restaurant without a `googlePlaceId`: save `googlePlaceId`, the result's `lat/lng` and `googleSyncedAt` = the page's fetch time (the time of the Google call, never the import time; refused when older than 24 hours; a live result is minutes old). Linking to a restaurant that already has a different `googlePlaceId` changes nothing and the result stays a possible duplicate. Then create `RestaurantDish(restaurant, dish)` with `status CANDIDATE, source GOOGLE_SEARCH, confidence 0.4` unless a row for that dish already exists: an import never changes an existing row, so it cannot downgrade a stronger one or revive a STALE or REMOVED one.
5. Logs carry ids and counts only (dish, area, results by status, place ids), never a Google name, address or error text.
6. Links to our restaurants open in a new tab, so the loaded results (billable to fetch again) stay; a refused Link or an error leaves the result open for another action, and Skip can be undone.

A restaurant with a `googlePlaceId` and no `googleSyncedAt` counts as due for the next refresh (§5).

### Merging duplicate restaurants (`RestaurantService.merge(sourceId, targetId)`)

Admin-only (`PATCH /api/v1/admin/restaurants/:id { mergeIntoId }` or the merge dialog). Everything runs in one database transaction; any failure rolls all of it back.

1. Dishes: a source `RestaurantDish` whose dish the target lacks moves to the target. When both serve the dish, keep the stronger row (status order OWNER_VERIFIED > MENU_VERIFIED > USER_CONFIRMED > CANDIDATE > STALE > REMOVED; tie → more distinct raters), give it the lower non-null price and the union of `variantTags`, move the other row's ratings and flags onto it, then delete the other row.
2. Ratings: one per user per kept row. When the same user rated both rows, keep the rating with the newer `updatedAt`; append the older rating (score, comment, createdAt) to the kept rating's `RatingHistory`, move the older rating's own history rows over, then delete the older `Rating`.
3. Flags move to the kept row; a flag is dropped when the same user already flagged that row for the same reason.
4. Menu uploads, owner claims and open review items of the source move to the target; a claim by a user who already claimed the target is dropped. If both restaurants are claimed by different owners, the merge stops with `MERGE_CONFLICTING_OWNERS`; if only the source is claimed, its owner moves to the target.
5. Google place: clear `googlePlaceId` on the source first (the column is unique), then set it on the target if the target has none, together with the source's `lat/lng` and `googleSyncedAt`. The source keeps no Google data: its `lat/lng` and `googleSyncedAt` are cleared with the place id. Restaurants of different cities cannot be merged (`MERGE_CITY_MISMATCH`).
6. Source: `status = DUPLICATE`, `mergedIntoId = target`. Its URLs redirect permanently to the surviving restaurant (docs/06), following `mergedIntoId` chains.
7. After commit: `recomputeOne` for every kept row whose ratings changed (until Phase 3 builds `recomputeOne`, the merge logs those ids), then `revalidatePath` for both restaurant pages and the affected ranking pages. Log one line with every moved, merged and dropped id. Ratings are moved with plain SQL, so their `updatedAt` (the decay clock) does not change.

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

### Places coordinate refresh (`/api/cron/refresh-places`, daily)

CLAUDE.md rule 2 allows Google `lat/lng` for at most 30 days. The job runs daily, oldest rows first:

1. Catch-up: any restaurant whose `googleSyncedAt` is older than 29 days (after missed runs) gets `lat/lng = NULL` and a `PLACE_REFRESH_FAILED` review item before anything else.
2. Select restaurants with a `googlePlaceId` whose `googleSyncedAt` is NULL or older than 25 days.
3. For each: `GET https://places.googleapis.com/v1/places/{googlePlaceId}` with header `X-Goog-FieldMask: location` (no `places.` prefix for Place Details; Essentials). Success → update `lat/lng`, `googleSyncedAt = now()`.
4. `NOT_FOUND` means the place ID is obsolete: set `lat/lng = NULL` at once and open a `PLACE_REFRESH_FAILED` review item. Any other error (after retries with backoff): keep the coordinates and retry on the next run, unless `googleSyncedAt` is already 28 days old or more; then set `lat/lng = NULL` and open the review item. Coordinates therefore stay under 30 days old as long as the job runs once a day.
5. One OPEN review item per restaurant; a later successful refresh resolves it automatically. Review items and logs record only Google's status code (`404 NOT_FOUND`, `503 UNAVAILABLE`) or our own reason (catch-up, missing API key), never Google's error text.
6. Stop before the function time limit (250 s: no new call once 235 s have passed, keeping room for one slow call with retries) and leave the rest for the next run. `JobRun.summary` records `{ selected, calls, ok, notFound, errors, nulled, caughtUp, reviewItems, resolvedReviewItems, skippedForTime, error? }`.
7. A row nulled by the catch-up is still due, so the same run refreshes it: success restores its coordinates and resolves the item. A failure on a row whose `googleSyncedAt` is NULL (unknown age) counts as 28+ days. Without `GOOGLE_PLACES_API_KEY` the catch-up still runs and every due row counts as a failure (so the 28-day rule still holds); the run is then marked failed (`JobRun.ok = false`, HTTP 500).

A restaurant with NULL `lat/lng` stays listed; it only loses the map link.

### Other nightly steps

- Stale marking by status age.
- `Rating` comments with phone/URL → hidden pending review (regex at write time; nightly sweep as backup).
- Trust recompute.
- Weekly `RankingSnapshot`.
- `JobRun` rows for every job; admin dashboard shows last 10 runs.

## 6. Review queue — payloads and resolutions

| type | payload | admin actions |
|---|---|---|
| `UNMATCHED_MENU_ITEM` | `{ menuItemId, rawName, rawPrice, suggestions: [{dishSlug, conf}] }` | assign dish (→ RD MENU_VERIFIED) · ignore · create dish then assign |
| `DISH_PROPOSAL` | `{ name, note, restaurantId? }` | create dish (slug, category, aliases) · map to existing dish · reject |
| `RESTAURANT_PROPOSAL` | `{ name, cityId, areaId, note }` | create restaurant · link to existing · reject |
| `FLAG` | `{ restaurantDishId, reason, flagIds[] }` | uphold (NOT_SERVED ×3 upheld → RD REMOVED; RESTAURANT_CLOSED → Restaurant CLOSED) · dismiss |
| `SUSPICIOUS_RATINGS` | `{ restaurantDishId, ratingIds[], reason }` | release (ratings ACTIVE) · hide (HIDDEN, lower trust) · ban users |
| `OWNER_CLAIM` | `{ claimId, phone, proofNote }` | approve · reject |
| `DUPLICATE_RESTAURANT` | `{ restaurantIdA, restaurantIdB, similarity }` | merge B into A (rules in §2) · keep both |
| `PLACE_REFRESH_FAILED` | `{ restaurantId, googlePlaceId, error (Google status code or our own reason), googleSyncedAt }` | re-link (new `googlePlaceId` from a live search result on /admin/import; `lat/lng` and `googleSyncedAt` = that result's fetch time) · mark restaurant CLOSED · keep without coordinates (clears `googlePlaceId`) |

Every resolution writes `resolvedByUserId`, `resolution`, `resolvedAt`, and triggers `recomputeOne` where ratings changed.

## 7. Panel operations (non-code, but the plan depends on it)

- Recruit 8–12 panel members; admin sets `isPanel` (trust fixed at 1.3; 30 ratings/day, 10 per restaurant per day; no new-account burst hold; still blocked from restaurants they own).
- Week 1–2 target: every launch dish has ≥ 10 restaurants with ≥ 4 panel ratings each in Islamabad → bootstrap-mode eligibility.
- Panel uploads a menu photo at each visit (one tap on the restaurant page).
- Weekly 20-minute review session: clear the review queue, merge duplicates.
