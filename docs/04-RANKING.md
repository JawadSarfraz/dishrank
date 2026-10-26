# 04 — Ranking algorithm

Goal: a rank that people trust, that cannot be gamed cheaply, that explains itself in one sentence
("Bayesian average of recent ratings from different people").

All constants live in `src/server/services/ranking.constants.ts` and are listed here.

## Inputs

For one RestaurantDish (RD) in city `c` for dish `d`, each **active** rating `i` has:

- `s_i` ∈ {1..10} — score
- `a_i` — age in days (now − updatedAt of the rating). Only the rater's own submission, new or edited, sets `updatedAt`; status changes (hold, release, hide, ban) and merges are written with plain SQL and never move it.
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
     or there is no DishStat row (DishStat is written by recomputeAll, Phase 4; until then C = 6.5)
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

The rows are checked in this order: banned → panel → ≥ 2 hidden (0.3) → extreme-score pattern (0.6, abuse control 4) → 1.2 → 1.0 → 0.6 (DECISION-PENDING, docs/OPEN-QUESTIONS.md). "Upheld flags against their ratings" counts as none for now, because a `Flag` points at a dish row, not a rating. The nightly job (Phase 4) recomputes it for everyone; the admin decisions that change these inputs also apply the table at once: turning the panel off, hiding ratings and banning. Phase 3 builds only the panel toggle; a lasting `trustScore` override for non-panel users needs a decision first, since the nightly job would recompute it.

## Abuse controls (in RatingService, before compute)

1. **Owner self-rating**: if `restaurant.claimedByUserId == userId` → reject `OWNER_SELF_RATING`. Panel users are blocked the same way. Banned users are refused (`USER_BANNED`), and only `ACTIVE` restaurants take ratings (`RESTAURANT_INACTIVE`).
2. **Rate limits**: 15 ratings/user/day; 3 ratings/user/restaurant/day. Panel users: 30 ratings/day and 10 per restaurant per day. One rating per user per RD: a new submission replaces it (the old score and comment go to `RatingHistory`) and counts once toward both limits; there is no separate per-RD cooldown (DECISION-PENDING reading of the earlier "1 rating/user/RD/24h (edit replaces)"). Keys and windows: docs/06.
3. **Burst detection**: if an RD receives ≥ 5 ratings within 24h from non-panel accounts younger than 7 days → set those ratings `HELD`, create `ReviewItem SUSPICIOUS_RATINGS` with the rating ids. HELD ratings are excluded from compute until admin releases them. Details (DECISION-PENDING): arrival is `createdAt`, so an edit is not a new arrival; account age is taken at the rating's time; every qualifying rating is held, the 5th triggers it; one OPEN item per RD (reason `BURST`) lists all of them, also one already held for its comment, and later qualifying ratings in the window join it; every rating listed in a BURST item an admin released is cleared of the burst rule (never counted or held by it again), also one still held for its comment, while releasing a COMMENT item clears only the comment; a promotion to `USER_CONFIRMED` that the held ratings caused is not undone.
4. **Extreme-score pattern**: a user whose last 10 ratings are all 10 or all 1 across different restaurants gets trust 0.6 until reviewed (flag in nightly job, not blocking). As built: part of the trust table (`trustFor`, after the hidden-ratings penalty), so the nightly job and every immediate trust update apply it; "last 10" are the 10 most recent ratings of any status, "different restaurants" means more than one, and the cap lasts while the pattern does. There is no review item yet (DECISION-PENDING, docs/OPEN-QUESTIONS.md).
5. **Comment moderation**: a comment with a phone number, a link or an e-mail address holds the whole rating. A phone number is a complete Pakistani mobile (0300…, 92/0092 300…, or 300… with 10 digits), a landline with 0 or 92 and its area code, a UAN number (111…, optionally after an area code), a 0800/0900 number, a number starting with + or 00 and 9 or more digits, or 10 or more digits written together. Its digit groups may be joined by spaces, dashes, dots or brackets; groups joined by list or sum punctuation (/ , + = |) count only with a group of 5 or more digits or a leading 0, so price lists and bills are not numbers. Real dates and clock times and numbers written with thousands separators are ignored, and look-alike or invisible characters are normalised first (`comment-screen.ts`). A link is a scheme, "www.", a domain with a lowercase ending and a path, or a bare domain with a common lowercase ending (endings that are English words, such as "in" or "to", need a path). The rating is `HELD` (not counted) with an OPEN `SUSPICIOUS_RATINGS` item (reason `COMMENT`) until an admin releases or hides it (Decided 2026-10-26, the owner's Phase 3 instruction). The word blocklist is empty for now (DECISION-PENDING).
6. **Held and hidden ratings**: an edit keeps `HELD` or `HIDDEN` (only admins change them; the new comment is screened again), and the author cannot delete them (`RATING_UNDER_REVIEW`). Deleting an `ACTIVE` rating removes it with its history (DECISION-PENDING: hard delete).
7. **Dish row status**: a new rating on a `STALE` row makes it `USER_CONFIRMED` again (docs/02 lifecycle); a `REMOVED` row takes no ratings (`DISH_REMOVED`).

The checks run in RatingService in this order: user, restaurant and dish checks, photo check, rate limits, then one transaction (dish row, rating, history, comment hold, burst rule), then `recomputeOne` after commit.

## Compute paths

### `recomputeOne(restaurantDishId)` — on every rating write (synchronous, < 50 ms)

```sql
WITH r AS (
  SELECT rt.score, rt."userId", rt."updatedAt",
         u."trustScore" * power(0.5, EXTRACT(EPOCH FROM (now() - rt."updatedAt")) / 86400.0 / 180.0) AS w
  FROM "Rating" rt JOIN "User" u ON u.id = rt."userId"
  WHERE rt."restaurantDishId" = $1 AND rt.status = 'ACTIVE' AND u."bannedAt" IS NULL
)
SELECT count(*)                  AS rating_count,
       count(DISTINCT "userId")  AS distinct_raters,
       coalesce(sum(w),0)        AS weight_sum,
       coalesce(sum(w*score),0)  AS weighted_score_sum,
       max("updatedAt")          AS last_rated_at
FROM r;
```

(The service reads the counted ratings and does the same sums in TypeScript, with the half-life from `ranking.constants.ts`.) Then: `rawMean = weightedScoreSum / weightSum`, `score = bayes(W, rawMean, C, m)`, update RD, and if `distinctRaters >= 3 AND status = CANDIDATE` → `status = USER_CONFIRMED`, `lastVerifiedAt = now()`. With no counted ratings, `score`, `rawMean` and `lastRatedAt` are NULL and the sums 0.
(Because `Rating` is unique per user per RD, `ratingCount == distinctRaters`; keep both columns for future multi-rating support.)

Finally it re-ranks the row's (city, dish) list (docs/03 invariant 6f): in SQL, `rankInCity` = 1..n over the eligible rows in ranking order, NULL for every other row. A per-list advisory lock (taken before the row lock) keeps two re-ranks of one list apart. Restaurant status changes and merges re-rank the lists they touch.

### `recomputeAll()` — nightly cron 02:00 PKT (and `pnpm rankings:recompute`)

`src/server/services/ranking-nightly.service.ts`; the cron, the CLI and "Recompute now" on `/admin/rankings` run the same function. One run at a time: a run that started less than 30 minutes ago and has not finished refuses a second one (`409 JOB_RUNNING`).

1. Recompute `User.trustScore` from the trust table, skipping panel users (`isPanel`; trust stays 1.3) and banned users. One scan finds the users whose trust would change; each is re-checked and written under its user row lock, so a panel toggle or an admin decision made meanwhile wins.
2. For each city × dish: `DishStat.meanScore` = weighted mean of all active ratings of users who are not banned (same weights, decay at the run's time), `ratingCount`. A city × dish without counted ratings keeps its old row (none of its dish rows has a score).
3. For each RD with `ratingCount > 0`, a score, or an active rating (a recompute that failed after a commit is caught here): recompute as above (applies decay to all), without the per-row re-rank.
4. Mark stale: `CANDIDATE/USER_CONFIRMED` with no rating or verification in 270 days → `STALE`; `MENU_VERIFIED/OWNER_VERIFIED` after 365 days → `STALE`. The age runs from the latest of `lastRatedAt`, `lastVerifiedAt` and `createdAt`, so a new row is never stale.
5. Re-rank every (city, dish) list: `rankInCity` for eligible rows; `NULL` for the rest (after step 4, so a row that just went stale loses its rank). Steps 4 and 5 run per list in one transaction under the list's lock.
6. Weekly (Sunday in Pakistan): write `RankingSnapshot` per (city, dish) that ranks a restaurant, with the top 50 (`[{restaurantDishId, rank, score, votes}]`) — enables "moved up 2 places" later. A list whose last snapshot is more than 7 days old catches up on the next run; a second run the same day writes none.
7. Delete `RateLimitBucket` rows older than twice the longest limit window (2 days).
8. Log `JobRun` with counts (`trust`, `dishStats`, `rows`, `stale`, `lists`, `snapshots`, `rateLimitBuckets`, `durationMs`). A row that fails is logged and the run goes on, ending `ok: false`; any other error stops the run, is recorded in the JobRun and the next night retries.

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

As built (`listRankingRows` in `public.repo.ts`), the query also returns `CANDIDATE` rows (every status except `STALE` and `REMOVED`), because a dish row collecting its first votes is listed under "Not enough votes yet". The rows with a `rankInCity` are `eligible` (the re-rank applied the thresholds in SQL); the others are `insufficient`, sorted by votes (`distinctRaters`) DESC, `lastRatedAt` DESC, then name, each with `ratingsNeeded` = the larger of the missing raters and the missing weight counted in fresh new-account ratings (0.6 each). The service reads up to 400 rows and returns at most `limit` (100) of each list. Rank numbers are `rankInCity`: the city-wide positions of the eligible rows in this order, kept current by the re-rank (above); no filter or sort ever renumbers them. The ranking page always runs this query without `$area` (one cached page per city × dish) and never reads `searchParams`: area filter and sort run in the browser over the returned rows. Distance features (browser or API) use our own restaurant coordinates (from Overture or typed by an admin; docs/07 §2); a restaurant without a location has no distance. `GET /api/v1/rankings` may pass `$area` and `lat/lng/radiusKm` (haversine filter and `distanceKm`); it numbers ranks over the whole city list first, then filters.

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
- burst detection: the 5th young-account rating on one RD within 24 h holds all five and opens one ReviewItem listing them; panel members are exempt

## Phase 7 (deferred): pairwise votes

Add "Which was better?" prompts between two RDs the user has rated for the same dish. Fit Bradley–Terry per (city, dish) nightly; final = `0.7 × bayes_norm + 0.3 × bt_norm`. Table `PairwiseVote` already exists.
