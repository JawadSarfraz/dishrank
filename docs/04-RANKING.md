# 04 — Ranking algorithm

Goal: a rank that people trust, that cannot be gamed cheaply, that explains itself in one sentence
("Bayesian average of recent ratings from different people").

All constants live in `src/server/services/ranking.constants.ts` and are listed here.

## Inputs

For one RestaurantDish (RD) in city `c` for dish `d`, each **active** rating `i` has:

- `s_i` ∈ {1..10} — score
- `a_i` — age in days (now − updatedAt of the rating)
- `t_i` — trust of the rater **at compute time** (`User.trustScore`, 0.3..1.5)

## Weight of a rating

```
w_i = t_i × 0.5 ^ (a_i / H)        H = HALF_LIFE_DAYS = 180
```

A 6-month-old rating counts half; a 1-year-old rating counts a quarter.

## Score (Bayesian average)

```
W  = Σ w_i
R  = Σ (w_i × s_i) / W                 -- weighted mean, "rawMean"
C  = city-wide weighted mean for dish d (DishStat.meanScore), fallback 6.5 if DishStat.ratingCount < 50
m  = PRIOR_WEIGHT = 8

score = (W / (W + m)) × R + (m / (W + m)) × C
```

Few votes → score pulled toward the city average for that dish. Many votes → score ≈ R.

## Eligibility (to show a rank number)

```
eligible =
  RD.status IN (USER_CONFIRMED, MENU_VERIFIED, OWNER_VERIFIED)
  AND distinctRaters >= MIN_RATERS        (8)
  AND W >= MIN_WEIGHT                     (5.0)
  AND restaurant.status = ACTIVE
```

**Bootstrap mode**: while `City.launchedAt` is NULL (city not launched yet) and for 60 days after it, use `MIN_RATERS = 4`, `MIN_WEIGHT = 2.5`, and label the page "Early rankings". The seed never sets `launchedAt`; an admin sets it once from `/admin` on launch day.

Rows that are not eligible are returned in `insufficient[]` sorted by `ratingCount DESC, lastRatedAt DESC`, under the heading "Not enough votes yet". They never get a rank number.

## Ordering and ties

`ORDER BY score DESC, distinctRaters DESC, lastRatedAt DESC, restaurant.name ASC`

## Trust score (per user)

| Situation | trustScore |
|---|---|
| New account | 0.6 |
| ≥ 3 active ratings AND ≥ 1 with photo | 1.0 |
| ≥ 20 active ratings, no upheld flags against their ratings, ≥ 30% with photo | 1.2 |
| Panel member (`User.isPanel`, set by admin only) | 1.3, fixed: the nightly job skips panel users |
| ≥ 2 of their ratings hidden by admin | 0.3 |
| Banned | ratings set HIDDEN |

Trust is recomputed by the nightly job from these rules; admin can override `trustScore` (cap 1.5).

## Abuse controls (in RatingService, before compute)

1. **Owner self-rating**: if `restaurant.claimedByUserId == userId` → reject `OWNER_SELF_RATING`. Panel users are blocked the same way.
2. **Rate limits**: 15 ratings/user/day; 3 ratings/user/restaurant/day; 1 rating/user/RD/24h (edit replaces). Panel users: 30 ratings/day and 10 per restaurant per day.
3. **Burst detection**: if an RD receives ≥ 5 ratings within 24h from non-panel accounts younger than 7 days → set those ratings `HELD`, create `ReviewItem SUSPICIOUS_RATINGS` with the rating ids. HELD ratings are excluded from compute until admin releases them.
4. **Extreme-score pattern**: a user whose last 10 ratings are all 10 or all 1 across different restaurants gets trust 0.6 until reviewed (flag in nightly job, not blocking).
5. **Comment moderation**: comments with phone numbers, URLs, or words in a blocklist are hidden pending review.

## Compute paths

### `recomputeOne(restaurantDishId)` — on every rating write (synchronous, < 50 ms)

```sql
WITH r AS (
  SELECT rt.score,
         u."trustScore" * power(0.5, EXTRACT(EPOCH FROM (now() - rt."updatedAt")) / 86400.0 / 180.0) AS w
  FROM "Rating" rt JOIN "User" u ON u.id = rt."userId"
  WHERE rt."restaurantDishId" = $1 AND rt.status = 'ACTIVE' AND u."bannedAt" IS NULL
)
SELECT count(*)            AS rating_count,
       count(DISTINCT 1)   AS placeholder, -- distinctRaters computed separately (ratings are unique per user already)
       coalesce(sum(w),0)  AS weight_sum,
       coalesce(sum(w*score),0) AS weighted_score_sum
FROM r;
```

Then in TypeScript: `rawMean = weightedScoreSum / weightSum`, `score = bayes(W, rawMean, C, m)`, update RD, and if `distinctRaters >= 3 AND status = CANDIDATE` → `status = USER_CONFIRMED`, `lastVerifiedAt = now()`.
(Because `Rating` is unique per user per RD, `ratingCount == distinctRaters`; keep both columns for future multi-rating support.)

### `recomputeAll()` — nightly cron 02:00 PKT (and `pnpm rankings:recompute`)

1. Recompute `User.trustScore` from the trust table, skipping panel users (`isPanel`; trust stays 1.3).
2. For each city × dish: `DishStat.meanScore` = weighted mean of all active ratings (same weights), `ratingCount`.
3. For each RD with `ratingCount > 0`: recompute as above (applies decay to all).
4. Set `rankInCity` for eligible rows per (city, dish); `NULL` for the rest.
5. Mark stale: `CANDIDATE/USER_CONFIRMED` with no rating or verification in 270 days → `STALE`; `MENU_VERIFIED/OWNER_VERIFIED` after 365 days → `STALE`.
6. Weekly (Sunday): write `RankingSnapshot` per (city, dish) with top 50 — enables "moved up 2 places" later.
7. Log `JobRun` with counts; abort and log if any step throws (next night retries).

## Query for a ranking page

```sql
SELECT rd.*, r.name, r.slug, r."areaId", r."priceBand", r.lat, r.lng
FROM "RestaurantDish" rd
JOIN "Restaurant" r ON r.id = rd."restaurantId" AND r.status = 'ACTIVE'
WHERE rd."cityId" = $city AND rd."dishId" = $dish
  AND rd.status IN ('USER_CONFIRMED','MENU_VERIFIED','OWNER_VERIFIED')
  AND ($area IS NULL OR r."areaId" = $area)
ORDER BY rd.score DESC NULLS LAST, rd."distinctRaters" DESC, rd."lastRatedAt" DESC, r.name ASC
LIMIT 100;
```

Split into `eligible` / `insufficient` in the service using the thresholds (bootstrap-aware). Rank numbers are the city-wide positions of the eligible rows in this order; no filter or sort ever renumbers them. The ranking page always runs this query without `$area` (one cached page per city × dish) and never reads `searchParams`: area filter and sort run in the browser over the returned rows. Distance features (browser or API) use our own restaurant coordinates (from Overture or typed by an admin; docs/07 §2); a restaurant without a location has no distance. `GET /api/v1/rankings` may pass `$area` and `lat/lng/radiusKm` (haversine filter and `distanceKm`); it numbers ranks over the whole city list first, then filters.

## Worked example

Dish: Chicken Karahi, Islamabad. City prior C = 7.2, m = 8.

| Restaurant | ratings (score, age days, trust) | W | R | score |
|---|---|---|---|---|
| A | 12 ratings, mean 9.1, mostly fresh, trust 1.0 → W ≈ 10.8 | 10.8 | 9.1 | (10.8/18.8)×9.1 + (8/18.8)×7.2 = **8.29** |
| B | 3 ratings of 10, new accounts (trust 0.6) → W = 1.8 | 1.8 | 10 | not eligible (raters < 8) → shown under "not enough votes yet" |
| C | 40 ratings, mean 8.0, half are a year old → W ≈ 28 | 28 | 8.0 | (28/36)×8.0 + (8/36)×7.2 = **7.82** |

A ranks above C despite fewer votes because its votes are better and fresh; B cannot buy its way in with three 10s.

## Unit tests required (`tests/unit/ranking/`)

- weight halves at 180 days, quarters at 360
- bayes pulls toward prior when W small, toward R when W large
- eligibility thresholds incl. bootstrap mode
- tie-break ordering
- HELD / HIDDEN / banned-user ratings excluded
- recomputeOne promotes CANDIDATE → USER_CONFIRMED at 3 raters
- burst detection holds the 5th rating and creates a ReviewItem

## Phase 7 (deferred): pairwise votes

Add "Which was better?" prompts between two RDs the user has rated for the same dish. Fit Bradley–Terry per (city, dish) nightly; final = `0.7 × bayes_norm + 0.3 × bt_norm`. Table `PairwiseVote` already exists.
