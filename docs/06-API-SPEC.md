# 06 — API spec

Two surfaces, one set of services:

- **Server actions** (`src/server/actions/*`) — used by forms in the app. Thin wrappers: `requireUser()` → zod → service → `revalidatePath`.
- **Route handlers** (`src/app/api/v1/**`) — JSON for the same operations (future mobile app, scripts, admin tools).

All responses: `{ data: ... }` or `{ error: { code, message, details? } }`. A JSON body over 32 KB answers `413 PAYLOAD_TOO_LARGE` (Phase 6). A write that collides with another one at the same moment (deadlock) is tried once more on the server, then answers `409 CONFLICT`: try again. Pagination is cursor-based: `?cursor=&limit=` → `{ data, nextCursor }`.

Auth: Better Auth session cookie (database session). Roles enforced server-side. Cron endpoints use `Authorization: Bearer ${CRON_SECRET}`.

## Rate limits (`src/server/rate-limit.ts`, DB sliding window)

| Key | Limit |
|---|---|
| `user:{id}:rating` | 15 / day (panel: 30) |
| `user:{id}:rating:restaurant:{rid}` | 3 / day (panel: 10) |
| `user:{id}:add-dish` | 10 / day |
| `user:{id}:flag` | 10 / day ("Report a problem", Phase 4; flags in Phase 5) |
| `user:{id}:claim` | 3 / day, owner claims (Phase 6, DECISION-PENDING) |
| `user:{id}:owner-write` | 200 / hour, an owner's dish edits (Phase 6, DECISION-PENDING) |
| `user:{id}:account-delete` | 3 / day, deleting one's own account (Phase 6) |
| `user:{id}:proposal` | 5 / day |
| `user:{id}:upload` | 20 / day (signed dish and menu photos) |
| `user:{id}:menu-upload` | 10 / day, menu photos filed for parsing (Phase 5, DECISION-PENDING) |
| `user:{id}:rating-delete` | 30 / day (DECISION-PENDING) |
| `user:{id}:location` | 30 / day, panel members' on-site locations (DECISION-PENDING) |
| `ip:{hash}:search` | 120 / min |
| `ip:{hash}:api` | 600 / hour (public GETs) |
| `ip:{hash}:dispute` | 5 / day, the /dispute form (DECISION-PENDING) |
| `ip:{hash}:event` | 300 / hour, ranking-page views reported by the browser (Phase 6, DECISION-PENDING) |
| `ip:{hash}:health` | 12 / min, `GET /api/health` for an uptime monitor (DECISION-PENDING) |
| `user:{id}:admin-write` | 600 / hour (every admin write: import create/link/skip/reopen, add, edit, status, merge, review decisions, panel toggle) |

Exceeding → `429 { error: { code: "RATE_LIMITED" } }`. The nightly job deletes buckets older than 2 days (twice the longest window). Windows roll: hits are counted in buckets of max(5 s, window / 12), so a daily key frees up over 22–24 h. Every call that reaches a check counts, also one that a later check refuses. Rating keys: every submission counts, new or edited (docs/04 abuse control 2); a rating that adds the dish row does not spend `add-dish`, which only `POST /api/v1/restaurant-dishes` spends when it creates a row.

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
      { "rank": 1, "restaurant": {"slug":"butt-karahi-f-7","name":"Butt Karahi","area":{"slug":"f-7","name":"F-7"},"priceBand":2,"lat":..,"lng":..},
        "restaurantDishId":"...", "score": 8.29, "rawMean": 9.1, "votes": 12, "price": 2200,
        "variantTags":["desi"], "status":"MENU_VERIFIED", "lastRatedAt":"...", "distanceKm": 1.4 }
    ],
    "insufficient": [ { "restaurant": {...}, "restaurantDishId":"...", "votes": 3, "price": 1900, "variantTags": [],
        "status":"CANDIDATE", "lastRatedAt":"...", "distanceKm": null, "ratingsNeeded": 5 } ],
    "thresholds": { "minRaters": 8, "minWeight": 5 },
    "computedAt": "..."
  }
}
```
Distance (`lat`, `lng`, `radiusKm`, `distanceKm`) and the restaurant `lat`/`lng` use our own coordinates (from Overture or typed by an admin, docs/07 §2); a restaurant without a location has `lat`, `lng` and `distanceKm` null and is left out by `radiusKm`. Sort `price` uses `price ASC NULLS LAST` among eligible only. `votes` = `distinctRaters DESC`. `rank` is always the city-wide rank, also when `area`, `sort` or `radiusKm` narrow or reorder the list. `insufficient` lists every listed row without a rank (also `CANDIDATE` rows), by votes, then the latest rating, then name; `ratingsNeeded` counts fresh new-account ratings (trust 0.6). `dish` also carries its `id`. An unknown city or dish → `404 NOT_FOUND`. Limit: `ip:{hash}:api`. The ranking page does not call this endpoint; it calls `getRanking` on the server and filters in the browser.

### `GET /api/v1/restaurants/search?city=&q=`
→ `[{ id, slug, name, area, address }]` (max 8; `area` is the area name). Unknown city → `404 CITY_NOT_FOUND`; a `q` with no letters or digits → `[]`. Limits: `ip:{hash}:search` and `ip:{hash}:api`.

### `GET /api/v1/restaurants/:slug`
→ `{ restaurant, dishes: [{ dish, restaurantDishId, score, votes, rankInCity, status, price, variantTags }], claimed: boolean }` (dishes ordered: eligible by score, then others by votes). `restaurant.phone` is null on a listing nobody has checked and no owner has claimed (auto-listed, 2026-11-11): the page, its JSON-LD and this route share the field. A merged restaurant (`status DUPLICATE`) answers `301` with `Location` set to the surviving restaurant's endpoint (chains of merges are followed). CLOSED and HIDDEN restaurants answer `404`. The restaurant object is `{ id, slug, name, city, area, address, phone, website, priceBand, lat, lng }`; `lat`/`lng` are our own coordinates, null when the location is unknown. Limit: `ip:{hash}:api`.

### `GET /api/v1/users/:username` → public profile: ratingsCount, recent ratings (no email). **Not built** (KICKOFF-REVIEW AP-10: `username` is never assigned; dropped unless a profile page is wanted).

## Authenticated (role USER+)

### `POST /api/v1/ratings`
Body (JSON only: another `Content-Type` → `415 UNSUPPORTED_MEDIA_TYPE`, a bad body → `400 INVALID_JSON`):
```json
{ "restaurantId": "...", "dishId": "...", "score": 8, "taste": 4, "portion": 3, "value": 4,
  "comment": "Best ginger in F-7", "photoPath": "dish-photos/<userId>/<random>.jpg" }
```
Rules: score 1–10 int; sub-scores 1–5 optional; comment ≤ 280; `dishId` from the canonical list. `photoPath` is `dish-photos/<random>.(jpg|jpeg|webp)` from `POST /api/v1/uploads/sign` signed by this user (its `Upload` row; `dish-photos/<userId>/<random>…` for photos signed before Phase 6); the object must exist in storage, be at most 5 MB and image/jpeg or image/webp, and be on no other rating. On an edit a missing `photoPath` keeps the earlier photo and `photoPath: null` removes it; a photo no rating uses any more has its file deleted after the commit. If the RD doesn't exist → created as CANDIDATE / USER / 0.5. A STALE RD becomes USER_CONFIRMED again; a REMOVED one takes no ratings. Replaces an existing rating by this user (the old score and comment go to RatingHistory); an edit keeps a HELD or HIDDEN status. Runs the docs/04 abuse checks in RatingService, then `recomputeOne`.
Returns `201` (new) or `200` (replaced): `{ ratingId, restaurantDishId, created, status: "ACTIVE"|"HELD"|"HIDDEN", held, heldReason: null|"COMMENT"|"BURST", stale, score, votes, eligible, rank, previousRank, ratingsNeeded, minRaters, mode: "normal"|"bootstrap", restaurant: { id, slug, name, citySlug }, dish: { id, slug, name } }` (`score`, `votes`, `rank` describe the dish row after the recompute; `rank` is `rankInCity`, null when not eligible; `ratingsNeeded` is how many more 0.6-trust raters it needs to rank; `previousRank` is the row's rank before this rating and `minRaters` the city's current rater threshold, so the success screen can say what the rating did). A held rating is still a success, with `held: true` (`status` HIDDEN: an admin hid the earlier rating and the edit stays hidden). `stale: true`: saved, but the dish row's recompute failed (logged); `score`, `votes` and `rank` are not current. The restaurant is checked again under a share lock inside the write, so a merge, closing or claim that commits meanwhile is never missed. `Rating.photoPath` is unique: two ratings saved at the same moment with one photo give one `PHOTO_IN_USE`.
Errors: `401 UNAUTHENTICATED`, `403 USER_BANNED`, `404 NOT_FOUND` (restaurant), `409 RESTAURANT_INACTIVE`, `403 OWNER_SELF_RATING`, `404 DISH_NOT_FOUND`, `409 DISH_REMOVED`, `400 PHOTO_NOT_YOURS`, `400 PHOTO_NOT_FOUND`, `400 PHOTO_INVALID`, `409 PHOTO_IN_USE`, `400 UPLOADS_DISABLED` (a photo while storage is not set up), `429 RATE_LIMITED`, `400 VALIDATION_FAILED`.

### `DELETE /api/v1/ratings/:id`
Own rating only (anyone else's answers `404 NOT_FOUND`). A HELD or HIDDEN rating cannot be deleted by its author: `409 RATING_UNDER_REVIEW`. The rating and its history are deleted (DECISION-PENDING: hard delete), then `recomputeOne`. Limit: `user:{id}:rating-delete`. → `{ id }`.

### `GET /api/v1/me/ratings?cursor=&limit=`
Own ratings of any status, newest first (`limit` ≤ 100, default 50) → `{ data: [{ id, score, taste, portion, value, comment, photoPath, status, createdAt, updatedAt, restaurantDishId, dish: { id, slug, name }, restaurant: { id, slug, name, active, area, city: { slug, name } } }], nextCursor }`. `status` HELD = under review, HIDDEN = not counted.

### `POST /api/v1/restaurant-dishes`
`{ restaurantId, dishId, menuName?, price? }` → creates CANDIDATE / USER / 0.5 if absent (`201`, spends `add-dish`); an existing row is returned as it is (`200`), except a REMOVED one: `409 DISH_REMOVED` (only an admin revives it). → `{ id, status, created }`. The restaurant must be ACTIVE and not the caller's own.

### Delete my account (Phase 6; server action `deleteAccountAction`, no JSON route yet)
`{ confirm: "DELETE" }` (strict) from /me → deletes the signed-in user's account: their ratings of any status with their history (the dish rows are recomputed and their pages revalidated), their dish-photo files, the OPEN reports, disputes, suggestions and claims they filed, their sessions, Google accounts, panel locations, claims, flags, upload rows and rate-limit counters. Kept without the name (SET NULL): menu photos they uploaded, review items already decided, the restaurants they managed (no longer claimed). The dish rows are locked first (lists, rows, then the user); a rating saved meanwhile answers `409 CONFLICT` (try again). An ADMIN → `409 ADMIN_ACCOUNT` (removed by hand, so the site never loses its last admin). A banned account deletes itself like any other, but the one-way hash of its e-mail (an HMAC of the trimmed, lowercased address keyed from `IP_HASH_SECRET`, `BannedEmail`) stays on the ban list, and Better Auth's sign-up hook refuses that Google account afterwards (`/sign-in?error=ACCOUNT_BANNED`; audit 2026-11 A-01, owner 2026-11-05). An admin's ban decision writes the same hash at once. Decided review items the user filed stay as the record, with the claim's phone number and proof note and a dispute's contact blanked (`redacted: true`); menu photos they signed but never filed are deleted with the account. The session cookie is cleared. Limit: `user:{id}:account-delete`.

### `POST /api/v1/reports` (Phase 4, "Report a problem" on restaurant pages)
`{ restaurantId, reason: CLOSED|WRONG_LOCATION|WRONG_DISH|OTHER, dishId?, note? (≤ 280) }` (strict) → `201 { id }`: one `ReviewItem FLAG` with payload `{ kind: "report", restaurantId, reason, dishId, note }`; nothing changes on the public pages until an admin acts. Banned users → `403 USER_BANNED`; an unknown or merged restaurant → `404 NOT_FOUND`; an unknown dish → `404 DISH_NOT_FOUND`. Limit: `user:{id}:flag`. The page uses the server action `reportProblemAction`.

### `POST /api/v1/events` (Phase 6, light analytics; no sign-in needed)
`browserEventInput` (strict) → `204`: `{ name: "ranking_view" | "share_click", city, dish, source? }` or `{ name: "sign_in_started" | "in_app_sign_in_started" | "in_app_left_browser", source? }`; `source` is the visit's tag (`sourceTag`: lowercase letters and digits, ≤ 12; docs/01 D1b), read by the browser from its session cookie. `rating_submitted` carries the rater's `User.source`. `/admin/analytics` adds a Sources table: per week and source, dish-page visits, new raters and ratings (2026-11-11). The pages are static, so the browser reports what only it can see: a view once per load (`ViewBeacon`), a tap on Share, a tap on Continue with Google in a normal browser, reaching a sign-in step inside an app's built-in browser (Facebook, Instagram, Messenger, TikTok, LinkedIn, Snapchat, X, Pinterest, Line, WeChat, any other Android WebView or iOS WKWebView; never Chrome, Safari or the installed app, 2026-11-11), and tapping Open in Chrome or Copy link there. Unknown city or dish → `404 NOT_FOUND`. One `AnalyticsEvent` row: the name, the city and dish slugs when the event has them, and the day in Pakistan; never a user, an IP address or a time of day. Recorded on the server: `rating_submitted` (after a rating is saved), `search` (a dish or restaurant search with text: the city only, never the words) and a finished Google sign-in, `sign_in_completed`, or `in_app_sign_in_completed` when it began in an in-app browser: the page there links back with `?via=in-app`, and the mark rides the OAuth state as `additionalData`. `/admin/analytics` shows the weekly counts. No third-party tracker. Limit: `ip:{hash}:event`.

### `POST /api/v1/disputes` (Phase 4, the /dispute form; no sign-in needed)
`{ message (10–1000), contact? (≤ 200), page? (≤ 300) }` (strict) → `201 { id }`: one `ReviewItem FLAG` with payload `{ kind: "dispute", message, contact, page }`. No e-mail is sent yet (DECISION-PENDING: no e-mail provider; admins see disputes on /admin/review). Limit: `ip:{hash}:dispute`. The page uses the server action `fileDisputeAction`.

### `POST /api/v1/flags` (Phase 5; **not built**: Flag rows wait for a later phase, docs/08 Phase 5; "Report a problem" files FLAG review items through `POST /api/v1/reports`)
`{ restaurantDishId, reason: NOT_SERVED|WRONG_DISH|RESTAURANT_CLOSED|DUPLICATE|OTHER, note? }` → creates Flag + `ReviewItem FLAG` (one review item per RD per reason while OPEN).

### `POST /api/v1/proposals`
`{ type: "DISH", name, restaurantId?, note? }` (the restaurant the diner was rating) or `{ type: "RESTAURANT", name, cityId, areaId, note? }` (the area must be in that city, else `400 AREA_NOT_IN_CITY`) → `ReviewItem DISH_PROPOSAL | RESTAURANT_PROPOSAL` only; nothing is created until an admin decides (docs/07 §6). → `201 { id, type, duplicate: false }`; the same person's open suggestion with the same name answers `200 { id, type, duplicate: true }` and files nothing new. Limit: `user:{id}:proposal`.

### `POST /api/v1/uploads/sign`
`{ kind: "dish-photo" | "menu", contentType: "image/jpeg" | "image/webp", sizeBytes ≤ 5 MB }` → `{ path, uploadUrl, method: "PUT", headers, expiresAt }`: a presigned S3 `PUT` for Supabase Storage (S3 protocol, ADR-14), valid 10 minutes, for one object key; the content type is signed, so the client must send exactly `headers`. `dish-photo` → public `dish-photos` bucket, key `<random>.<ext>`, `path` = `dish-photos/<random>.<ext>`; `menu` (Phase 5) needs `restaurantId` (and only it has one) and the caller must be a panel member, the restaurant's owner or an admin (`403 MENU_UPLOAD_NOT_ALLOWED`; `404 NOT_FOUND`, `409 RESTAURANT_INACTIVE`) → private `menus` bucket, key `<restaurantId>/<random>.<ext>`, `path` = `menus/<key>`. Phase 6: no path contains the user id; each signed URL writes an `Upload` row (user, kind, path, restaurant for menus), and a rating or menu upload accepts the path only from the user who signed it (`400 PHOTO_NOT_YOURS`); paths signed before Phase 6 (`dish-photos/<userId>/…`) keep their folder check. Uploads nothing has used for 24 hours are deleted every night with their row. Without the four `SUPABASE_S3_*` variables: `503 UPLOADS_DISABLED` (the rate flow then hides the photo step). The client resizes to at most 1600 px and re-encodes before upload, which strips EXIF/GPS. Limit: `user:{id}:upload`.

### `POST /api/v1/location-observations`
Panel members only (`403 PANEL_ONLY`, read from the database): `{ restaurantId, lat, lng, accuracyM }` from the browser at the restaurant. `accuracyM` worse than 50 m → `400 LOCATION_TOO_COARSE` (never saved). Saved as a `LocationObservation`, never on a rating. When the restaurant has no location, or the observation is more than 150 m from it, one OPEN `LOCATION_SUGGESTION` review item is created or updated (docs/07 §7). → `201 { observationId, suggestion: "none" | "created" | "updated" }`. Limit: `user:{id}:location`.

## Owner (role OWNER or ADMIN)

- `POST /api/v1/owner/claims` `{ restaurantId, phone, proofNote }` → `OwnerClaim PENDING` + `ReviewItem OWNER_CLAIM`. Phase 6 builds it as the server action `claimRestaurantAction` ("Is this your restaurant?" on the restaurant page) for **any** signed-in user (a claimant is a USER until approved), with `claimInput` (`phone`, `proofNote` ≤ 500 required); no JSON route yet (AP-07). → `{ id, status: "PENDING", duplicate }`. Errors: `403 USER_BANNED`, `404 NOT_FOUND`, `409 RESTAURANT_INACTIVE`, `409 ALREADY_OWNER`, `409 RESTAURANT_CLAIMED`. Limit: `user:{id}:claim`.
- `GET /api/v1/owner/restaurants` → restaurants claimed by me. Phase 6 builds the owner area as pages and server actions (no JSON routes yet, AP-07): /owner lists them (`listMyRestaurants`), /owner/restaurants/[id] shows one (`getOwnerRestaurant`; not theirs → `404 NOT_FOUND`; a banned account → `403 USER_BANNED`, audit 2026-11).
- `POST /api/v1/owner/restaurants/:id/menus` `{ path }` → `MenuUpload PENDING` (parse is triggered by admin or cron). Phase 5 builds it as the server action `submitMenuUploadAction { restaurantId, path }` on the restaurant page, for panel members, the restaurant's owner and admins (no JSON route yet). The path must be the caller's upload for that restaurant (`400 PHOTO_NOT_YOURS`) and in storage (`400 PHOTO_NOT_FOUND`, `400 PHOTO_INVALID`); a path filed already → `409 MENU_ALREADY_SUBMITTED`. Limit: `user:{id}:menu-upload`. → `{ id, status: "PENDING", parsingEnabled }`. `menuUploadAccessAction(restaurantId)` → `{ allowed }` tells the page whether to show the button.
- `PATCH /api/v1/owner/restaurant-dishes/:id` `{ menuName?, price?, variantTags?, status: "OWNER_VERIFIED" | "REMOVED" }` (only for own restaurant). Built as `updateOwnerDishAction(rowId, ownerDishInput)`: `{ action: "confirm" }` · `{ action: "edit", menuName: string ≤ 120 | null, price: 1..1,000,000 | null }` (also confirms) · `{ action: "remove", reason? ≤ 280 }` (logged). A REMOVED row → `409 DISH_REMOVED`; another restaurant's row → `404 NOT_FOUND`. Variant tags stay with menus and admins. Limit: `user:{id}:owner-write`.
- `GET /api/v1/owner/restaurants/:id/report` → per dish: rank, score, votes, trend vs last snapshot, top 3 competitors in same area (names + scores only). Built on /owner/restaurants/[id]: per dish the current status, score, votes and rank, and the weekly snapshots of the last 12 weeks (rank, score, votes). Competitors are not shown yet (owner's Phase 6 scope).

## Admin (role ADMIN)

- `GET /api/v1/admin/review-queue?type=&status=OPEN&cursor=&limit=` → `{ data, nextCursor, counts }` (counts of OPEN items per type). Each item carries a `fingerprint` of what it shows (payload, restaurant, and each listed rating's id, status and `updatedAt`), and each rating of an open BURST item `looksGenuine` (docs/07 §6). Phase 3 serves `SUSPICIOUS_RATINGS`, `DISH_PROPOSAL`, `RESTAURANT_PROPOSAL` and `LOCATION_SUGGESTION`, Phase 4 `FLAG` (reports and disputes: `uphold` marks it done, `dismiss` rejects it), Phase 5 `UNMATCHED_MENU_ITEM` (`assign_dish`, `create_dish_and_assign`, `ignore`, docs/07 §6), Phase 6 `OWNER_CLAIM` (`approve`, `reject` with a required `reason`; a banned claimant → `409 USER_BANNED`, reject instead; an item whose claim no longer exists can only be rejected); `DUPLICATE_RESTAURANT` answers `400 NOT_AVAILABLE`.
- `POST /api/v1/admin/review-queue/:id/resolve` `{ action, payload, fingerprint? }` — actions per type (docs/07 §Review queue): `assign_dish`, `ignore`, `create_dish_and_assign`, `create_dish`, `map_to_dish`, `create_restaurant`, `link_restaurant`, `reject`, `uphold`, `dismiss`, `release`, `release_genuine`, `hide`, `ban_users`, `approve`, `merge`, `keep_both` (type → actions map: `REVIEW_ACTIONS` in `src/server/validation`). An item that is not OPEN → `409 ITEM_CLOSED`; an item that changed since its `fingerprint` (new ratings joined, an edited comment, a better location) → `409 ITEM_CHANGED`, nothing decided (/admin/review always sends it); an action of another type → `400 ACTION_NOT_ALLOWED`; a type of a later phase → `400 NOT_AVAILABLE`; `create_dish` → `409 DISH_EXISTS` or `409 ALIAS_TAKEN`. The decision takes its locks in the shared order (restaurant → dish rows → item). After it the affected dish rows are recomputed, the affected users' trust is refreshed, and the answer's `dishPages` (ranking and restaurant pages of those rows) are revalidated. Limit: `user:{id}:admin-write`.
- `POST /api/v1/admin/restaurants` — add by hand (`source MANUAL`) `{ name, areaId, address, phone?, website?, priceBand?, aliases?, lat?, lng?, dishSlugs? }`; the city is the area's; `lat` and `lng` go together and become `locationSource ADMIN`; each dish slug becomes a CANDIDATE RestaurantDish (source ADMIN, confidence 0.4). The slug is `<name>-<area slug>` (area not repeated when the name ends with it), then `-2`, `-3`… when taken; it never changes afterwards.
- `PATCH /api/v1/admin/restaurants/:id` — edit `{ name, areaId, address, phone|null, website|null, priceBand|null, aliases, lat?|null, lng?|null }` (changed coordinates become `locationSource ADMIN`; null clears the location), `{ status: ACTIVE|CLOSED|HIDDEN }`, merge (`{ mergeIntoId }`; one transaction, rules in docs/07 §2; sets `mergedIntoId` and status DUPLICATE). In v1 these admin operations are server actions on /admin pages (`src/server/actions/admin-*.ts`) calling the same services; the JSON routes are not built yet (KICKOFF-REVIEW AP-07). An edit, a status change and a merge revalidate the restaurant page and every ranking, city and home page that lists one of the restaurant's dish rows (audit 2026-11).
- Remove a restaurant's owner (2026-11-04; server action `removeRestaurantOwnerAction(restaurantId, { ownerId, reason })` on /admin/restaurants, no JSON route yet, as AP-07): `reason` 1–500 characters, required and logged; `ownerId` is the owner the page showed. Clears `claimedByUserId` and `claimedAt`; the user loses OWNER when they manage no other restaurant (an ADMIN keeps ADMIN); their ratings there count again (rows recomputed, pages revalidated). Errors: `404 NOT_FOUND`, `409 NOT_CLAIMED`, `409 ITEM_CHANGED` (another owner by now). → `{ ownerRoleRemoved }`. Limit: `user:{id}:admin-write`.
- `PATCH /api/v1/admin/restaurant-dishes/:id` — status / confidence / tags. **Not built** (AP-07): dish rows change through owners, menu photos and review decisions.
- `PATCH /api/v1/admin/users/:id` — `trustScore`, `role`, `bannedAt`, `isPanel` (setting it gives the table's panel row, trust 1.0 since 2026-11-11; clearing it returns the user to the table's other rows). Built: one strict body per request, `{ isPanel }` (Phase 3: on → trust 1.3; off → the docs/04 trust table at once) or `{ trustOverride: 0.3..1.5 | null }` (a trust set by hand, stored apart from `trustScore` so the nightly job keeps it and winning over the panel's 1.3; null returns to the table). Then every dish row the user's ratings count in is recomputed and its pages revalidated → the user (`id`, `isPanel`, `trustScore`, `trustOverride`) with `recomputedRows` and `dishPages`. The /admin/users page uses the server actions `setPanelAction` and `setTrustOverrideAction`. Limit: `user:{id}:admin-write`.
- `PATCH /api/v1/admin/ratings/:id` — `status: ACTIVE|HELD|HIDDEN`. **Not built** (AP-07): a rating changes status only through a `SUSPICIOUS_RATINGS` decision (release, hide, ban); whether an admin needs a direct control is in docs/OPEN-QUESTIONS.md.
- `POST /api/v1/admin/menu-uploads/:id/parse` — run vision + matching now (docs/07 §3). Phase 5 builds it as the server action `parseMenuNowAction(uploadId)` ("Parse now" on /admin/menus/[id]; no JSON route yet, as AP-07): it waits for the parse and returns `{ uploadId, status: PARSED|REVIEWED|FAILED, items, matched, needsReview, error, model, usage, dishPages }`. Refused before any API call: `503 PARSING_DISABLED`, `503 UPLOADS_DISABLED`, `409 MENU_ALREADY_PARSED`, `409 PARSE_RUNNING`, `429 DAILY_CAP_REACHED` (50 parses in 24 hours). Limit: `user:{id}:admin-write`.
- `POST /api/v1/admin/rankings/recompute` — `recomputeAll()`. Phase 4 builds it as the server action `recomputeNowAction` on /admin/rankings (no JSON route yet, as AP-07): it waits for the run and returns `{ jobRunId, ok, summary }`; `409 JOB_RUNNING` while another run is going. Then every page is revalidated.
- `/admin/rankings` "Featured dishes" (2026-11-11): server action `setFeaturedAction { city, dishSlugs[] (0–2 launch dishes), roundName?, closesOn? (YYYY-MM-DD, end of that day in Pakistan) }` replaces the city's `FeaturedDish` rows and sets `City.featuredRound` and `featuredClosesAt`; the home page, the city page and the dish pages concerned (old and new) are revalidated. Seed: chicken karahi and mutton karahi in both cities, "winter results", closing 2026-12-20 (`seed/cities.json`, applied only to a city with nothing set). Errors: `404 CITY_NOT_FOUND`, `400 DISH_NOT_FOUND`. Limit: `user:{id}:admin-write`. No JSON route.
- `POST /api/v1/admin/cities/:slug/launch` — sets `City.launchedAt = now()` once; bootstrap mode applies while it is NULL and for 60 days after, so this ends early rankings 60 days later and starts nothing (docs/04). Phase 4 builds it as the server action `launchCityAction { city }`, the button "End early rankings in 60 days" with a confirm step: an unknown city → `404 CITY_NOT_FOUND`, one with a date already → `409 CITY_LAUNCHED`. Limit for both: `user:{id}:admin-write`.
- `/admin/import` review of Overture candidates (server actions in `src/server/actions/admin-import.ts`; no JSON route yet; docs/07 §2). The page reads `?city=&area=<slug>|none&show=new|skipped|done`. Create `createFromCandidateAction { candidateId, name, areaId, address, phone?, website?, priceBand?, aliases?, dishSlugs? }` (the location comes from the candidate, never from the client) → `{ restaurant, dishesAdded }`; Link `linkCandidateAction { candidateId, restaurantId }` → `{ restaurant, citySlug, overtureIdSet, locationSet }`; Skip `skipCandidateAction { candidateId, reason?: CLOSED|DUPLICATE|NOT_A_RESTAURANT }`; Reopen `reopenCandidateAction { candidateId }`. A candidate that is not `NEW` (not `SKIPPED` for Reopen) answers `409 CANDIDATE_REVIEWED` (`CANDIDATE_NOT_SKIPPED`).
- "Rate the places you know" on a dish page: `quickRatePlacesAction { city, dish }` (anyone; a signed-out caller is limited by `ip:{hash}:api`) → `{ signedIn, city, dish, mine, places: [{ restaurantId, slug, name, area, mine }] }`; each score is `POST /api/v1/ratings`, and a search hit comes from `GET /api/v1/restaurants/search`. A signed-out tap saves nothing: it opens `/rate?city=&r=&d=&score=` (docs/01 D4a).
- Panel invite links (docs/07 §7a), server actions only: `createPanelInviteAction { label, maxUses? (1–500), expiresInDays? (1–90), next? (a path on this site) }` → `{ id, url }`, `revokePanelInviteAction(id)`; `startPanelInviteAction(token)` and `joinPanelAction(token)` → `{ outcome: joined | already }`, `410 INVITE_UNUSABLE` for a link that cannot be used.
- `/admin/contenders?city=&dish=` (docs/01 D2a, 2026-11-11): one dish's public list in one city, the linked places the contender rule keeps out, and the removed rows. `addContendersAction { restaurantId, dishSlugs[] }` ticks each dish on a listed restaurant (a missing row becomes CANDIDATE / ADMIN / 0.4, a REMOVED or STALE one comes back as CANDIDATE and is recomputed) and marks the listing checked; `setContenderRowAction { restaurantDishId, action: remove | restore }` sets one row REMOVED (off the list and the ranking, ratings kept, no new ones) or back to CANDIDATE. Both revalidate the dish, restaurant, city and home pages. Errors: `404 NOT_FOUND`, `409 RESTAURANT_INACTIVE`, `400 DISH_NOT_FOUND`. Limit: `user:{id}:admin-write`. No JSON route.
- `/admin/import/auto-list` (docs/07 §2a): the page is the dry run. Apply `applyAutoListAction { limit? (1–200, default 100) }` → `{ created, dishLinks, skipped, failed, remaining }`, one batch per call. `/admin/restaurants?check=auto-unchecked` lists what it created and nobody has looked at yet; `markRestaurantCheckedAction(restaurantId)` ("Looks right"). No JSON route.

## Health (no auth)

### `GET /api/health` (uptime monitor)
→ `200 {"ok":true}` when a trivial database query (`SELECT 1`) answers within 3 s, otherwise `503 {"ok":false}`; past the limit `429 {"ok":false}`. The rate-limit write and the query share the 3 s, so the answer comes after about 3 s at most. Nothing else in the answer: the reason of a 503 is logged (`health.fail`: `timeout`, or `database` with the error). `Cache-Control: no-store`, no sign-in, outside `/api/v1`, never counted in analytics. HEAD works too (Next.js answers it from GET). Limit: `ip:{hash}:health`.

## Cron (Bearer CRON_SECRET)

- `GET /api/cron/parse-menus` — daily 01:00 PKT (`0 20 * * *` UTC): up to 20 PENDING menu photos, oldest first, one at a time, none started after 120 s, stopping at the daily cap (docs/07 §3), then the pages of the dish rows they verified are revalidated. Without `ANTHROPIC_API_KEY` and `ANTHROPIC_VISION_MODEL` it parses nothing and answers ok. JobRun `parse-menus`. → `{ ok, summary: { enabled, considered, parsed, failed, skipped, deferred, capReached, inputTokens, outputTokens, matchCalls, durationMs } }`.
- `GET /api/cron/recompute-rankings` — daily 02:00 PKT (`0 21 * * *` UTC); `recomputeAll()` (docs/04 steps 1–8, including stale marking), then every page is revalidated. → `{ ok, summary }`.
- `GET /api/cron/mark-stale` — not scheduled; for manual runs only (recompute already does it): stale marking and re-rank of every list, with its own JobRun (`mark-stale`). → `{ ok, summary: { stale, lists, durationMs } }`.

A run while another of the same job is going (an unfinished JobRun younger than 30 minutes) answers `409 { ok: false, error: { code: "JOB_RUNNING" } }`.

All cron handlers fail closed: `500 { error: { code: "CRON_SECRET_MISSING" } }` when `CRON_SECRET` is unset or empty, `401` when the bearer token does not match. Compare with `crypto.timingSafeEqual` on equal-length buffers (length mismatch → 401). Handlers are idempotent, write `JobRun` (including external API call counts) and return `{ ok, summary }`; `ok: false` answers HTTP 500. When a job throws, the answer is `500 { ok: false, error: { code: "INTERNAL", message } }` with a fixed message; the error itself is only in the log and the `JobRun` (audit 2026-11). The recompute's summary also counts the expired sessions it deleted (`sessions`).

## Zod schemas (`src/server/validation/`)

`ratingInput`, `restaurantDishInput`, `flagInput`, `proposalInput`, `claimInput`, `uploadSignInput`, `rankingQuery`, `restaurantSearchQuery`, `adminRestaurantInput`, `reviewResolveInput`; Phase 3: `locationObservationInput`, `meRatingsQuery`, `dishSearchQuery`; Phase 4: `reportInput`, `disputeInput`, `cityLaunchInput`; for /admin: `adminRestaurantUpdateInput`, `candidateCreateInput`, `candidateLinkInput`, `candidateSkipInput`, `candidateReopenInput`, `importQueueQuery`, `adminUserListQuery`, `adminUserUpdateInput`, `reviewQueueQuery`; Phase 5: `menuUploadInput`, `menuUploadsQuery`; Phase 6: `browserEventInput`, `ownerDishInput` (and `claimInput` in use) (and `uploadSignInput` takes `restaurantId` for menus). Export inferred types; reuse in both actions and handlers.
