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
Sort `price` uses `price ASC NULLS LAST` among eligible only. `votes` = `distinctRaters DESC`. `rank` is always the city-wide rank, also when `area`, `sort` or `radiusKm` narrow or reorder the list. The ranking page does not call this endpoint with filters; it filters in the browser.

### `GET /api/v1/restaurants/search?city=&q=`
→ `[{ id, slug, name, area, address }]` (max 8)

### `GET /api/v1/restaurants/:slug`
→ `{ restaurant, dishes: [{ dish, restaurantDishId, score, votes, rankInCity, status, price, variantTags }], claimed: boolean }` (dishes ordered: eligible by score, then others by votes)

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
- `POST /api/v1/admin/review-queue/:id/resolve` `{ action, payload }` — actions per type (docs/07 §Review queue).
- `POST /api/v1/admin/restaurants` — create from import row `{ name, cityId, areaId, address, lat, lng, googlePlaceId?, phone?, priceBand? }`.
- `PATCH /api/v1/admin/restaurants/:id` — edit, `status`, merge (`{ mergeIntoId }` moves RDs/ratings, marks DUPLICATE).
- `PATCH /api/v1/admin/restaurant-dishes/:id` — status / confidence / tags.
- `PATCH /api/v1/admin/users/:id` — `trustScore`, `role`, `bannedAt`, `isPanel` (setting it pins trust at 1.3; clearing it returns the user to the nightly trust rules).
- `PATCH /api/v1/admin/ratings/:id` — `status: ACTIVE|HELD|HIDDEN`.
- `POST /api/v1/admin/menu-uploads/:id/parse` — run vision + matching now.
- `POST /api/v1/admin/rankings/recompute` — `RankingService.recomputeAll()` (async, returns JobRun id).
- `POST /api/v1/admin/cities/:slug/launch` — sets `City.launchedAt = now()` once (launch day); bootstrap mode applies while it is NULL and for 60 days after.
- `POST /api/v1/admin/import/candidates` — multipart CSV from `scripts/seed-places.ts` → preview rows (dedupe by googlePlaceId/name+area) → admin confirms per row.

## Cron (Bearer CRON_SECRET)

- `GET /api/cron/recompute-rankings` — daily 02:00 PKT (`0 21 * * *` UTC).
- `GET /api/cron/refresh-places` — monthly: for restaurants with `googlePlaceId` and `googleSyncedAt` older than 25 days, fetch Place Details (field mask `location` only) and update `lat/lng/googleSyncedAt`.
- `GET /api/cron/mark-stale` — daily, part of recompute (kept separate for manual runs).

All cron handlers: idempotent, write `JobRun`, return `{ ok, summary }`.

## Zod schemas (`src/server/validation/`)

`ratingInput`, `restaurantDishInput`, `flagInput`, `proposalInput`, `claimInput`, `uploadSignInput`, `rankingQuery`, `restaurantSearchQuery`, `adminRestaurantInput`, `reviewResolveInput`. Export inferred types; reuse in both actions and handlers.
