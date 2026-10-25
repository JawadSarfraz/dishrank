# 06 — API spec

Two surfaces, one set of services:

- **Server actions** (`src/server/actions/*`) — used by forms in the app. Thin wrappers: `requireUser()` → zod → service → `revalidatePath`.
- **Route handlers** (`src/app/api/v1/**`) — JSON for the same operations (future mobile app, scripts, admin tools).

All responses: `{ data: ... }` or `{ error: { code, message, details? } }`. Pagination is cursor-based: `?cursor=&limit=` → `{ data, nextCursor }`.

Auth: Better Auth session cookie (database session). Roles enforced server-side. Cron endpoints use `Authorization: Bearer ${CRON_SECRET}`.

## Rate limits (`src/server/rate-limit.ts`, DB sliding window)

| Key | Limit |
|---|---|
| `user:{id}:rating` | 15 / day (panel: 30) |
| `user:{id}:rating:restaurant:{rid}` | 3 / day (panel: 10) |
| `user:{id}:add-dish` | 10 / day |
| `user:{id}:flag` | 10 / day |
| `user:{id}:proposal` | 5 / day |
| `user:{id}:upload` | 20 / day |
| `ip:{hash}:search` | 120 / min |
| `ip:{hash}:api` | 600 / hour (public GETs) |
| `global:places-search` | 150 / day for all admins together (each live Places search page on /admin/import is a billable Google call; counted after validation) |
| `user:{id}:admin-write` | 600 / hour (every admin write: import create/link, edit, status, merge) |

Exceeding → `429 { error: { code: "RATE_LIMITED" } }`.

## Public (no auth)

### `GET /api/v1/cities`
→ `[{ slug, name, areas: [{ slug, name }] }]`

### `GET /api/v1/dishes?city=&q=&launchOnly=`
→ `[{ slug, name, category, isLaunch, eligibleCount }]` (eligibleCount = eligible RDs in that city; sorted launch first, then eligibleCount desc; `q` uses trigram over `DishAlias`, docs/05)

### `GET /api/v1/rankings?city=islamabad&dish=chicken-karahi&area=&sort=score|votes|price&lat=&lng=&radiusKm=&limit=`
→
```json
{
  "data": {
    "city": {"slug":"islamabad","name":"Islamabad"},
    "dish": {"slug":"chicken-karahi","name":"Chicken Karahi"},
    "mode": "normal | bootstrap",
    "eligible": [
      { "rank": 1, "restaurant": {"slug":"butt-karahi-f-7","name":"Butt Karahi","area":"F-7","priceBand":2,"lat":..,"lng":..},
        "restaurantDishId":"...", "score": 8.29, "rawMean": 9.1, "votes": 12, "price": 2200,
        "variantTags":["desi"], "status":"MENU_VERIFIED", "lastRatedAt":"...", "distanceKm": 1.4 }
    ],
    "insufficient": [ { "restaurant": {...}, "votes": 3, "price": 1900, "status":"CANDIDATE" } ],
    "thresholds": { "minRaters": 8, "minWeight": 5 },
    "computedAt": "..."
  }
}
```
Distance (`lat`, `lng`, `radiusKm`, `distanceKm`) and the restaurant `lat`/`lng` in this payload are (on hold: docs/OPEN-QUESTIONS.md, Phase 4 distance and Google coordinates): Google coordinates may be kept for our own use but not re-served as data (Maps Platform Terms 3.2.3(a)). Sort `price` uses `price ASC NULLS LAST` among eligible only. `votes` = `distinctRaters DESC`. `rank` is always the city-wide rank, also when `area`, `sort` or `radiusKm` narrow or reorder the list. The ranking page does not call this endpoint with filters; it filters in the browser.

### `GET /api/v1/restaurants/search?city=&q=`
→ `[{ id, slug, name, area, address }]` (max 8; `area` is the area name). Unknown city → `404 CITY_NOT_FOUND`; a `q` with no letters or digits → `[]`. Limits: `ip:{hash}:search` and `ip:{hash}:api`.

### `GET /api/v1/restaurants/:slug`
→ `{ restaurant, dishes: [{ dish, restaurantDishId, score, votes, rankInCity, status, price, variantTags }], claimed: boolean }` (dishes ordered: eligible by score, then others by votes). A merged restaurant (`status DUPLICATE`) answers `301` with `Location` set to the surviving restaurant's endpoint (chains of merges are followed). CLOSED and HIDDEN restaurants answer `404`. The restaurant object carries no coordinates (see the Phase 4 open question). Limit: `ip:{hash}:api`.

### `GET /api/v1/users/:username` → public profile: ratingsCount, recent ratings (no email).

## Authenticated (role USER+)

### `POST /api/v1/ratings`
Body:
```json
{ "restaurantId": "...", "dishId": "...", "score": 8, "taste": 4, "portion": 3, "value": 4,
  "comment": "Best ginger in F-7", "photoPath": "dish-photos/abc.jpg" }
```
Rules: score 1–10 int; sub-scores 1–5 optional; comment ≤ 280; `photoPath` must be under `dish-photos/` and belong to this user. If the RD doesn't exist → created as CANDIDATE/USER. Replaces an existing rating by this user. Runs abuse checks. Returns `{ ratingId, restaurantDishId, score, eligible, rank }`.
Errors: `OWNER_SELF_RATING`, `RATE_LIMITED`, `RESTAURANT_INACTIVE`, `HELD_FOR_REVIEW` (still 200 but `held: true`).

### `DELETE /api/v1/ratings/:id` — own rating only; triggers recomputeOne.

### `GET /api/v1/me/ratings?cursor=` — own ratings with restaurant/dish.

### `POST /api/v1/restaurant-dishes`
`{ restaurantId, dishId, menuName?, price? }` → creates CANDIDATE if absent, returns the RD. No-op if exists.

### `POST /api/v1/flags`
`{ restaurantDishId, reason: NOT_SERVED|WRONG_DISH|RESTAURANT_CLOSED|DUPLICATE|OTHER, note? }` → creates Flag + `ReviewItem FLAG` (one review item per RD per reason while OPEN).

### `POST /api/v1/proposals`
`{ type: "DISH" | "RESTAURANT", name, cityId?, areaId?, note? }` → `ReviewItem DISH_PROPOSAL | RESTAURANT_PROPOSAL`.

### `POST /api/v1/uploads/sign`
`{ kind: "dish-photo" | "menu", contentType, sizeBytes }` → `{ uploadUrl, path }` (Supabase signed upload URL, valid 2 h and bound to one path; max 5 MB; image/jpeg or image/webp, since the client re-encodes). `dish-photo` → public `dish-photos` bucket under a random cuid file name; `menu` → private `menus` bucket. The client resizes and re-encodes before upload, which strips EXIF/GPS.

## Owner (role OWNER or ADMIN)

- `POST /api/v1/owner/claims` `{ restaurantId, phone, proofNote }` → `OwnerClaim PENDING` + `ReviewItem OWNER_CLAIM`.
- `GET /api/v1/owner/restaurants` → restaurants claimed by me.
- `POST /api/v1/owner/restaurants/:id/menus` `{ path }` → `MenuUpload PENDING` (parse is triggered by admin or cron).
- `PATCH /api/v1/owner/restaurant-dishes/:id` `{ menuName?, price?, variantTags?, status: "OWNER_VERIFIED" | "REMOVED" }` (only for own restaurant).
- `GET /api/v1/owner/restaurants/:id/report` → per dish: rank, score, votes, trend vs last snapshot, top 3 competitors in same area (names + scores only).

## Admin (role ADMIN)

- `GET /api/v1/admin/review-queue?type=&status=OPEN&cursor=`
- `POST /api/v1/admin/review-queue/:id/resolve` `{ action, payload }` — actions per type (docs/07 §Review queue): `assign_dish`, `ignore`, `create_dish_and_assign`, `create_dish`, `map_to_dish`, `create_restaurant`, `link_restaurant`, `reject`, `uphold`, `dismiss`, `release`, `hide`, `ban_users`, `approve`, `merge`, `keep_both`, `relink`, `mark_closed`, `keep_without_coordinates` (type → actions map: `REVIEW_ACTIONS` in `src/server/validation`).
- `POST /api/v1/admin/restaurants` — create from a live search result `{ name, cityId, areaId, address, lat, lng, googlePlaceId?, fetchedAt?, phone?, priceBand?, aliases? }`; `fetchedAt` (the time of the Google response that showed the place) is required with `googlePlaceId`, because `googleSyncedAt = fetchedAt`. The slug is `<name>-<area slug>` (area not repeated when the name ends with it), then `-2`, `-3`… when taken; it never changes afterwards.
- `PATCH /api/v1/admin/restaurants/:id` — edit `{ name, areaId, address, phone|null, priceBand|null, aliases, lat?, lng? }` (lat/lng only for a restaurant without a `googlePlaceId`), `{ status: ACTIVE|CLOSED|HIDDEN }`, merge (`{ mergeIntoId }`; one transaction, rules in docs/07 §2; sets `mergedIntoId` and status DUPLICATE). In v1 these admin operations are server actions on /admin pages (`src/server/actions/admin-*.ts`) calling the same services; the JSON routes are not built yet (KICKOFF-REVIEW AP-07).
- `PATCH /api/v1/admin/restaurant-dishes/:id` — status / confidence / tags.
- `PATCH /api/v1/admin/users/:id` — `trustScore`, `role`, `bannedAt`, `isPanel` (setting it pins trust at 1.3; clearing it returns the user to the nightly trust rules).
- `PATCH /api/v1/admin/ratings/:id` — `status: ACTIVE|HELD|HIDDEN`.
- `POST /api/v1/admin/menu-uploads/:id/parse` — run vision + matching now.
- `POST /api/v1/admin/rankings/recompute` — `RankingService.recomputeAll()` (async, returns JobRun id).
- `POST /api/v1/admin/cities/:slug/launch` — sets `City.launchedAt = now()` once (launch day); bootstrap mode applies while it is NULL and for 60 days after.
- `/admin/import` live search (server actions in `src/server/actions/admin-import.ts`; no JSON route yet): `searchPlacesAction { dishSlug, areaId, pageToken? }` → one Text Search page `{ dish, area, city, fetchedAt, results: [{ googlePlaceId, displayName, formattedAddress, attributions, lat|null, lng|null, mapsUrl, status: new|imported|possible_duplicate|no_location, existing, duplicates }], nextPageToken }` (docs/07 §1–2). Names and addresses are display only: never saved, logged, cached or prefilled. Create `{ name, address (typed by the admin), cityId, areaId, lat, lng, googlePlaceId, fetchedAt, phone?, priceBand?, aliases?, dishSlug }` and Link `{ restaurantId, googlePlaceId, lat, lng, fetchedAt, dishSlug }` save only the place id, lat/lng and `googleSyncedAt = fetchedAt` from Google; fetch times older than 30 days are refused.

## Cron (Bearer CRON_SECRET)

- `GET /api/cron/recompute-rankings` — daily 02:00 PKT (`0 21 * * *` UTC); includes stale marking (docs/04 step 5).
- `GET /api/cron/refresh-places` — daily (`0 22 * * *` UTC): restaurants with a `googlePlaceId` whose `googleSyncedAt` is NULL or older than 25 days get Place Details (field mask `location`); failures follow docs/07 §5.
- `GET /api/cron/mark-stale` — not scheduled; for manual runs only (recompute already does it).

All cron handlers fail closed: `500 { error: { code: "CRON_SECRET_MISSING" } }` when `CRON_SECRET` is unset or empty, `401` when the bearer token does not match. Compare with `crypto.timingSafeEqual` on equal-length buffers (length mismatch → 401). Handlers are idempotent, write `JobRun` (including external API call counts) and return `{ ok, summary }`; `ok: false` answers HTTP 500 (refresh-places: rows were due but `GOOGLE_PLACES_API_KEY` is missing). When a job throws, the answer is `500 { ok: false, error: { code: "INTERNAL", message } }` and the summary is only in `JobRun`.

## Zod schemas (`src/server/validation/`)

`ratingInput`, `restaurantDishInput`, `flagInput`, `proposalInput`, `claimInput`, `uploadSignInput`, `rankingQuery`, `restaurantSearchQuery`, `adminRestaurantInput`, `reviewResolveInput`. Export inferred types; reuse in both actions and handlers.
