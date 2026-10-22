# 07 — Data pipelines

How restaurants and (restaurant, dish) links get into the system. Four sources, in order of trust:

| Source | Creates | Confidence | Status |
|---|---|---|---|
| Owner (claimed) | RestaurantDish | 1.0 | OWNER_VERIFIED |
| Menu photo → vision → matching | RestaurantDish | 0.85–1.0 auto, else review | MENU_VERIFIED |
| User rating / "add dish" | RestaurantDish | 0.5 | CANDIDATE → USER_CONFIRMED at 3 raters |
| Google Places text search (seed) | CSV candidates only | 0.4 | CANDIDATE after admin import |

## 1. Candidate seeding with Google Places (New)

**Purpose**: a starting list of restaurants per dish per area so the panel knows where to go and the rate flow has restaurants to pick. It never ranks anything.

`scripts/seed-places.ts --city=islamabad --dish=chicken-karahi [--areas=f-7,f-8]`

1. Load city + areas from DB.
2. For each area: `POST https://places.googleapis.com/v1/places:searchText`
   - body: `{ textQuery: "<dish name> <area name> <city>", includedType: "restaurant", locationBias: { circle: { center: {lat,lng}, radius: 2500 } }, pageSize: 20, regionCode: "PK", languageCode: "en" }`
   - header `X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.primaryType`
   - follow `nextPageToken` up to 3 pages.
3. Dedupe by `places.id`. Write `tmp/candidates-<city>-<dish>-<date>.csv` with columns: `googlePlaceId, displayName, formattedAddress, lat, lng, primaryType, queryArea, dishSlug`.
4. Print a summary (areas × results, cost estimate). Never touch the DB.

Budget: ~20 areas × ≤3 pages ≈ 60 calls per dish. 19 dishes ≈ 1,140 Text Search Pro calls — inside the 5,000/month free cap. Reuse the same restaurant across dishes: the import UI dedupes by place ID.

**Policy notes (keep these in the import UI copy)**
- We store `googlePlaceId` forever; `lat/lng` are refreshed monthly by `/api/cron/refresh-places` (Place Details, field mask `location`, Essentials tier, 10,000 free/month).
- The CSV is a scratch file. On import, the admin **types/confirms** the name and address (from the signboard, the restaurant's own page, or a visit). What we save is our record.
- Where Google data is shown in the admin import UI, show the Google logo attribution.

## 2. Admin import (`/admin/import`)

1. Upload CSV → preview table. For each row: match existing restaurant by `googlePlaceId`, else by trigram on name within the same area (similarity ≥ 0.6) → mark "possible duplicate".
2. Admin actions per row: **Create** (opens prefilled form: name, area, address, priceBand, phone; admin confirms) / **Link to existing** / **Skip**.
3. On Create or Link: upsert `RestaurantDish(restaurant, dishSlug)` with `status CANDIDATE, source GOOGLE_SEARCH, confidence 0.4` unless a stronger row already exists.
4. Log counts; leave the CSV in `tmp/`.

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
| `DUPLICATE_RESTAURANT` | `{ restaurantIdA, restaurantIdB, similarity }` | merge B into A · keep both |

Every resolution writes `resolvedByUserId`, `resolution`, `resolvedAt`, and triggers `recomputeOne` where ratings changed.

## 7. Panel operations (non-code, but the plan depends on it)

- Recruit 8–12 panel members; admin sets `isPanel` (trust fixed at 1.3; 30 ratings/day, 10 per restaurant per day; no new-account burst hold; still blocked from restaurants they own).
- Week 1–2 target: every launch dish has ≥ 10 restaurants with ≥ 4 panel ratings each in Islamabad → bootstrap-mode eligibility.
- Panel uploads a menu photo at each visit (one tap on the restaurant page).
- Weekly 20-minute review session: clear the review queue, merge duplicates.
