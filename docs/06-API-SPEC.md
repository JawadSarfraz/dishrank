# 06 — API spec

Two surfaces, one set of services:

- **Server actions** (`src/server/actions/*`) — used by forms in the app. Thin wrappers: `requireUser()` → zod → service → `revalidatePath`.
- **Route handlers** (`src/app/api/v1/**`) — JSON for the same operations (future mobile app, scripts, admin tools).

All responses: `{ data: ... }` or `{ error: { code, message, details? } }`. A write that collides with another one at the same moment (deadlock) is tried once more on the server, then answers `409 CONFLICT`: try again. Pagination is cursor-based: `?cursor=&limit=` → `{ data, nextCursor }`.

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
| `user:{id}:rating-delete` | 30 / day (DECISION-PENDING) |
| `user:{id}:location` | 30 / day, panel members' on-site locations (DECISION-PENDING) |
| `ip:{hash}:search` | 120 / min |
| `ip:{hash}:api` | 600 / hour (public GETs) |
| `user:{id}:admin-write` | 600 / hour (every admin write: import create/link/skip/reopen, add, edit, status, merge, review decisions, panel toggle) |

Exceeding → `429 { error: { code: "RATE_LIMITED" } }`. Windows roll: hits are counted in buckets of max(5 s, window / 12), so a daily key frees up over 22–24 h. Every call that reaches a check counts, also one that a later check refuses. Rating keys: every submission counts, new or edited (docs/04 abuse control 2); a rating that adds the dish row does not spend `add-dish`, which only `POST /api/v1/restaurant-dishes` spends when it creates a row.

## Public (no auth)

### `GET /api/v1/cities`
→ `[{ id, slug, name, areas: [{ id, slug, name }] }]` (ids for `POST /api/v1/proposals`). Limit: `ip:{hash}:api`.

### `GET /api/v1/dishes?city=&q=&launchOnly=`
→ `[{ id, slug, name, category, isLaunch, eligibleCount }]` (eligibleCount = eligible RDs in that city; sorted launch first, then eligibleCount desc; `q` uses trigram over `DishAlias`, docs/05). Limits: `ip:{hash}:api`, plus `ip:{hash}:search` when `q` is given.

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
Distance (`lat`, `lng`, `radiusKm`, `distanceKm`) and the restaurant `lat`/`lng` use our own coordinates (from Overture or typed by an admin, docs/07 §2); a restaurant without a location has `lat`, `lng` and `distanceKm` null and is left out by `radiusKm`. Sort `price` uses `price ASC NULLS LAST` among eligible only. `votes` = `distinctRaters DESC`. `rank` is always the city-wide rank, also when `area`, `sort` or `radiusKm` narrow or reorder the list. The ranking page does not call this endpoint with filters; it filters in the browser.

### `GET /api/v1/restaurants/search?city=&q=`
→ `[{ id, slug, name, area, address }]` (max 8; `area` is the area name). Unknown city → `404 CITY_NOT_FOUND`; a `q` with no letters or digits → `[]`. Limits: `ip:{hash}:search` and `ip:{hash}:api`.

### `GET /api/v1/restaurants/:slug`
→ `{ restaurant, dishes: [{ dish, restaurantDishId, score, votes, rankInCity, status, price, variantTags }], claimed: boolean }` (dishes ordered: eligible by score, then others by votes). A merged restaurant (`status DUPLICATE`) answers `301` with `Location` set to the surviving restaurant's endpoint (chains of merges are followed). CLOSED and HIDDEN restaurants answer `404`. The restaurant object is `{ id, slug, name, city, area, address, phone, website, priceBand, lat, lng }`; `lat`/`lng` are our own coordinates, null when the location is unknown. Limit: `ip:{hash}:api`.

### `GET /api/v1/users/:username` → public profile: ratingsCount, recent ratings (no email).

## Authenticated (role USER+)

### `POST /api/v1/ratings`
Body (JSON only: another `Content-Type` → `415 UNSUPPORTED_MEDIA_TYPE`, a bad body → `400 INVALID_JSON`):
```json
{ "restaurantId": "...", "dishId": "...", "score": 8, "taste": 4, "portion": 3, "value": 4,
  "comment": "Best ginger in F-7", "photoPath": "dish-photos/<userId>/<random>.jpg" }
```
Rules: score 1–10 int; sub-scores 1–5 optional; comment ≤ 280; `dishId` from the canonical list. `photoPath` is `dish-photos/<userId>/<random>.(jpg|jpeg|webp)` from `POST /api/v1/uploads/sign` for this user; the object must exist in storage, be at most 5 MB and image/jpeg or image/webp, and be on no other rating. If the RD doesn't exist → created as CANDIDATE / USER / 0.5. A STALE RD becomes USER_CONFIRMED again; a REMOVED one takes no ratings. Replaces an existing rating by this user (the old score and comment go to RatingHistory); an edit keeps a HELD or HIDDEN status. Runs the docs/04 abuse checks in RatingService, then `recomputeOne`.
Returns `201` (new) or `200` (replaced): `{ ratingId, restaurantDishId, created, status: "ACTIVE"|"HELD"|"HIDDEN", held, heldReason: null|"COMMENT"|"BURST", score, votes, eligible, rank, ratingsNeeded, mode: "normal"|"bootstrap", restaurant: { id, slug, name, citySlug }, dish: { id, slug, name } }` (`score`, `votes`, `rank` describe the dish row after the recompute; `rank` is `rankInCity`, null when not eligible; `ratingsNeeded` is how many more 0.6-trust raters it needs to rank). A held rating is still a success, with `held: true` (`status` HIDDEN: an admin hid the earlier rating and the edit stays hidden). The restaurant is checked again under a share lock inside the write, so a merge, closing or claim that commits meanwhile is never missed. `Rating.photoPath` is unique: two ratings saved at the same moment with one photo give one `PHOTO_IN_USE`.
Errors: `401 UNAUTHENTICATED`, `403 USER_BANNED`, `404 NOT_FOUND` (restaurant), `409 RESTAURANT_INACTIVE`, `403 OWNER_SELF_RATING`, `404 DISH_NOT_FOUND`, `409 DISH_REMOVED`, `400 PHOTO_NOT_YOURS`, `400 PHOTO_NOT_FOUND`, `400 PHOTO_INVALID`, `409 PHOTO_IN_USE`, `400 UPLOADS_DISABLED` (a photo while storage is not set up), `429 RATE_LIMITED`, `400 VALIDATION_FAILED`.

### `DELETE /api/v1/ratings/:id`
Own rating only (anyone else's answers `404 NOT_FOUND`). A HELD or HIDDEN rating cannot be deleted by its author: `409 RATING_UNDER_REVIEW`. The rating and its history are deleted (DECISION-PENDING: hard delete), then `recomputeOne`. Limit: `user:{id}:rating-delete`. → `{ id }`.

### `GET /api/v1/me/ratings?cursor=&limit=`
Own ratings of any status, newest first (`limit` ≤ 100, default 50) → `{ data: [{ id, score, taste, portion, value, comment, photoPath, status, createdAt, updatedAt, restaurantDishId, dish: { id, slug, name }, restaurant: { id, slug, name, active, area, city: { slug, name } } }], nextCursor }`. `status` HELD = under review, HIDDEN = not counted.

### `POST /api/v1/restaurant-dishes`
`{ restaurantId, dishId, menuName?, price? }` → creates CANDIDATE / USER / 0.5 if absent (`201`, spends `add-dish`); an existing row is returned as it is (`200`), except a REMOVED one: `409 DISH_REMOVED` (only an admin revives it). → `{ id, status, created }`. The restaurant must be ACTIVE and not the caller's own.

### `POST /api/v1/flags`
`{ restaurantDishId, reason: NOT_SERVED|WRONG_DISH|RESTAURANT_CLOSED|DUPLICATE|OTHER, note? }` → creates Flag + `ReviewItem FLAG` (one review item per RD per reason while OPEN).

### `POST /api/v1/proposals`
`{ type: "DISH", name, restaurantId?, note? }` (the restaurant the diner was rating) or `{ type: "RESTAURANT", name, cityId, areaId, note? }` (the area must be in that city, else `400 AREA_NOT_IN_CITY`) → `ReviewItem DISH_PROPOSAL | RESTAURANT_PROPOSAL` only; nothing is created until an admin decides (docs/07 §6). → `201 { id, type, duplicate: false }`; the same person's open suggestion with the same name answers `200 { id, type, duplicate: true }` and files nothing new. Limit: `user:{id}:proposal`.

### `POST /api/v1/uploads/sign`
`{ kind: "dish-photo" | "menu", contentType: "image/jpeg" | "image/webp", sizeBytes ≤ 5 MB }` → `{ path, uploadUrl, method: "PUT", headers, expiresAt }`: a presigned S3 `PUT` for Supabase Storage (S3 protocol, ADR-14), valid 10 minutes, for one object key; the content type is signed, so the client must send exactly `headers`. `dish-photo` → public `dish-photos` bucket, key `<userId>/<random>.<ext>`, `path` = `dish-photos/<userId>/<random>.<ext>`; `menu` → `400 NOT_AVAILABLE` until Phase 5 (private `menus` bucket). Without the four `SUPABASE_S3_*` variables: `503 UPLOADS_DISABLED` (the rate flow then hides the photo step). The client resizes to at most 1600 px and re-encodes before upload, which strips EXIF/GPS. Limit: `user:{id}:upload`.

### `POST /api/v1/location-observations`
Panel members only (`403 PANEL_ONLY`, read from the database): `{ restaurantId, lat, lng, accuracyM }` from the browser at the restaurant. `accuracyM` worse than 50 m → `400 LOCATION_TOO_COARSE` (never saved). Saved as a `LocationObservation`, never on a rating. When the restaurant has no location, or the observation is more than 150 m from it, one OPEN `LOCATION_SUGGESTION` review item is created or updated (docs/07 §7). → `201 { observationId, suggestion: "none" | "created" | "updated" }`. Limit: `user:{id}:location`.

## Owner (role OWNER or ADMIN)

- `POST /api/v1/owner/claims` `{ restaurantId, phone, proofNote }` → `OwnerClaim PENDING` + `ReviewItem OWNER_CLAIM`.
- `GET /api/v1/owner/restaurants` → restaurants claimed by me.
- `POST /api/v1/owner/restaurants/:id/menus` `{ path }` → `MenuUpload PENDING` (parse is triggered by admin or cron).
- `PATCH /api/v1/owner/restaurant-dishes/:id` `{ menuName?, price?, variantTags?, status: "OWNER_VERIFIED" | "REMOVED" }` (only for own restaurant).
- `GET /api/v1/owner/restaurants/:id/report` → per dish: rank, score, votes, trend vs last snapshot, top 3 competitors in same area (names + scores only).

## Admin (role ADMIN)

- `GET /api/v1/admin/review-queue?type=&status=OPEN&cursor=&limit=` → `{ data, nextCursor, counts }` (counts of OPEN items per type). Each item carries a `fingerprint` of what it shows (payload, restaurant, and each listed rating's id, status and `updatedAt`). Phase 3 serves `SUSPICIOUS_RATINGS`, `DISH_PROPOSAL`, `RESTAURANT_PROPOSAL` and `LOCATION_SUGGESTION`; the other types arrive with their phases.
- `POST /api/v1/admin/review-queue/:id/resolve` `{ action, payload, fingerprint? }` — actions per type (docs/07 §Review queue): `assign_dish`, `ignore`, `create_dish_and_assign`, `create_dish`, `map_to_dish`, `create_restaurant`, `link_restaurant`, `reject`, `uphold`, `dismiss`, `release`, `hide`, `ban_users`, `approve`, `merge`, `keep_both` (type → actions map: `REVIEW_ACTIONS` in `src/server/validation`). An item that is not OPEN → `409 ITEM_CLOSED`; an item that changed since its `fingerprint` (new ratings joined, an edited comment, a better location) → `409 ITEM_CHANGED`, nothing decided (/admin/review always sends it); an action of another type → `400 ACTION_NOT_ALLOWED`; a type of a later phase → `400 NOT_AVAILABLE`; `create_dish` → `409 DISH_EXISTS` or `409 ALIAS_TAKEN`. The decision takes its locks in the shared order (restaurant → dish rows → item). After it the affected dish rows are recomputed, the affected users' trust is refreshed, and the answer's `dishPages` (ranking and restaurant pages of those rows) are revalidated. Limit: `user:{id}:admin-write`.
- `POST /api/v1/admin/restaurants` — add by hand (`source MANUAL`) `{ name, areaId, address, phone?, website?, priceBand?, aliases?, lat?, lng?, dishSlugs? }`; the city is the area's; `lat` and `lng` go together and become `locationSource ADMIN`; each dish slug becomes a CANDIDATE RestaurantDish (source ADMIN, confidence 0.4). The slug is `<name>-<area slug>` (area not repeated when the name ends with it), then `-2`, `-3`… when taken; it never changes afterwards.
- `PATCH /api/v1/admin/restaurants/:id` — edit `{ name, areaId, address, phone|null, website|null, priceBand|null, aliases, lat?|null, lng?|null }` (changed coordinates become `locationSource ADMIN`; null clears the location), `{ status: ACTIVE|CLOSED|HIDDEN }`, merge (`{ mergeIntoId }`; one transaction, rules in docs/07 §2; sets `mergedIntoId` and status DUPLICATE). In v1 these admin operations are server actions on /admin pages (`src/server/actions/admin-*.ts`) calling the same services; the JSON routes are not built yet (KICKOFF-REVIEW AP-07).
- `PATCH /api/v1/admin/restaurant-dishes/:id` — status / confidence / tags.
- `PATCH /api/v1/admin/users/:id` — `trustScore`, `role`, `bannedAt`, `isPanel` (setting it pins trust at 1.3; clearing it returns the user to the nightly trust rules). Phase 3 builds only `{ isPanel }` (a strict body): on → trust 1.3; off → the docs/04 trust table at once; then every dish row the user's ratings count in is recomputed and its pages revalidated → the user with `recomputedRows` and `dishPages`. Limit: `user:{id}:admin-write`.
- `PATCH /api/v1/admin/ratings/:id` — `status: ACTIVE|HELD|HIDDEN`.
- `POST /api/v1/admin/menu-uploads/:id/parse` — run vision + matching now.
- `POST /api/v1/admin/rankings/recompute` — `RankingService.recomputeAll()` (async, returns JobRun id).
- `POST /api/v1/admin/cities/:slug/launch` — sets `City.launchedAt = now()` once (launch day); bootstrap mode applies while it is NULL and for 60 days after.
- `/admin/import` review of Overture candidates (server actions in `src/server/actions/admin-import.ts`; no JSON route yet; docs/07 §2). The page reads `?city=&area=<slug>|none&show=new|skipped|done`. Create `createFromCandidateAction { candidateId, name, areaId, address, phone?, website?, priceBand?, aliases?, dishSlugs? }` (the location comes from the candidate, never from the client) → `{ restaurant, dishesAdded }`; Link `linkCandidateAction { candidateId, restaurantId }` → `{ restaurant, citySlug, overtureIdSet, locationSet }`; Skip `skipCandidateAction { candidateId, reason?: CLOSED|DUPLICATE|NOT_A_RESTAURANT }`; Reopen `reopenCandidateAction { candidateId }`. A candidate that is not `NEW` (not `SKIPPED` for Reopen) answers `409 CANDIDATE_REVIEWED` (`CANDIDATE_NOT_SKIPPED`).

## Cron (Bearer CRON_SECRET)

- `GET /api/cron/recompute-rankings` — daily 02:00 PKT (`0 21 * * *` UTC); includes stale marking (docs/04 step 5).
- `GET /api/cron/mark-stale` — not scheduled; for manual runs only (recompute already does it).

All cron handlers fail closed: `500 { error: { code: "CRON_SECRET_MISSING" } }` when `CRON_SECRET` is unset or empty, `401` when the bearer token does not match. Compare with `crypto.timingSafeEqual` on equal-length buffers (length mismatch → 401). Handlers are idempotent, write `JobRun` (including external API call counts) and return `{ ok, summary }`; `ok: false` answers HTTP 500. When a job throws, the answer is `500 { ok: false, error: { code: "INTERNAL", message } }` and the summary is only in `JobRun`.

## Zod schemas (`src/server/validation/`)

`ratingInput`, `restaurantDishInput`, `flagInput`, `proposalInput`, `claimInput`, `uploadSignInput`, `rankingQuery`, `restaurantSearchQuery`, `adminRestaurantInput`, `reviewResolveInput`; Phase 3: `locationObservationInput`, `meRatingsQuery`, `dishSearchQuery`; for /admin: `adminRestaurantUpdateInput`, `candidateCreateInput`, `candidateLinkInput`, `candidateSkipInput`, `candidateReopenInput`, `importQueueQuery`, `adminUserListQuery`, `adminUserUpdateInput`, `reviewQueueQuery`. Export inferred types; reuse in both actions and handlers.
