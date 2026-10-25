# Kickoff review (2026-10-22)

> 2026-10-25: Google Places was dropped completely (docs/02 ADR-13). Findings about Places (the request body, field masks, budget and key restrictions, `googleSyncedAt`, the refresh-places cron, the import CSV) no longer apply; restaurant candidates now come from Overture Maps (docs/07 §1–2). The text below is kept as it was.

Findings from the Prompt 0 audit of this kit (6 of 8 audit areas finished; data model and product/SEO did not). Adversarial verification never ran, so every item is an unverified lead: confirm it against the cited docs before acting.

Triage: one pass by Claude on 2026-10-22, no sub-agents. Every finding is marked **blocker for Phases 0–2**, **later** (with the phase where it belongs; "not blocking" when that phase is 0–2), or **drop** (resolved by a decision in `docs/OPEN-QUESTIONS.md`, or not worth acting on).

| Mark | Findings |
|---|---|
| Blocker for Phases 0–2 | 15 in 8 groups, all fixed on 2026-10-22 |
| Later | 110 |
| Drop | 63 (55 resolved, 8 not worth acting on) |

## Blockers for Phases 0–2

All eight are fixed. The owner set up the laptop (Node 24, pnpm 12.14, PostgreSQL 17 on port 5433); groups 2–8 were applied to the docs in the commit "docs: phase 0-2 blocker fixes", with the owner's additions recorded under Decided in `docs/OPEN-QUESTIONS.md`.

1. **Dev environment cannot run Phase 0** (OP-05)
   - Problem: The laptop runs Node 20.19.4, below Vitest 5's engines; pnpm fails on a corrupt corepack cache; Homebrew PostgreSQL is 14.15 and must match the Supabase major.
   - Fix: Install Node 24 LTS; clear `~/.cache/node/corepack` and run `corepack prepare pnpm@12.14.0 --activate`; install the Homebrew PostgreSQL major the Supabase projects run, with pg_trgm and unaccent.
2. **Role checks only in layouts** (AP-05, OP-30)
   - Problem: Layouts do not re-run on client navigation, so admin/owner pages that read data (Phase 2 `/admin/import`, `/admin/restaurants`) are protected only on first load.
   - Fix: Extend CLAUDE.md rule 6 to pages: `requireRole()` is the first statement of every admin/owner page (or of the services they call); Prompt 8 audits pages too.
3. **"/admin returns 403" is not implementable as written** (AP-04)
   - Problem: A layout cannot send HTTP 403 without `forbidden()`, which needed `experimental.authInterrupts` in Next.js 15; Phase 0 acceptance is ambiguous and says nothing about signed-out visitors.
   - Fix: Signed-out → redirect to sign-in; wrong role → render a Forbidden page (use `forbidden()` only if stable in Next.js 16); reword the Phase 0 acceptance.
4. **Cron endpoints fail open when CRON_SECRET is unset** (AP-22)
   - Problem: A naive `Bearer ${process.env.CRON_SECRET}` check accepts `Bearer ` when the variable is empty, exposing recompute and billable refresh calls.
   - Fix: Return 500 when CRON_SECRET is unset and 401 on mismatch, compare with `crypto.timingSafeEqual`; add both cases to Phase 0 acceptance.
5. **Cron plan breaks the 30-day lat/lng rule** (PL-02, OP-01, RK-21, AP-21, ST-13, PL-23)
   - Problem: refresh-places runs monthly with a 25-day filter, so rows reach ~55 days (CLAUDE.md rule 2); mark-stale is a separate cron not ordered after recompute.
   - Fix: Schedule refresh-places daily with the 25-day filter; drop the separate mark-stale cron (recompute step 5 already does it; keep the endpoint for manual runs).
6. **Import never sets googleSyncedAt** (PL-22)
   - Problem: A NULL googleSyncedAt never matches "older than 25 days", so imported coordinates are never refreshed; phone/priceBand prefill is not in the field mask; CSV age is unbounded.
   - Fix: CSV carries `fetchedAt`; Create/Link sets `googleSyncedAt = fetchedAt`; refresh treats NULL as due; import refuses CSVs older than 30 days; drop phone/priceBand from the prefill.
   - Superseded 2026-10-25 by the live search (ST-16): no CSV and no prefill; `googleSyncedAt` = the search response time; Create and Link accept results at most 24 hours old.
7. **Places Text Search request body is invalid** (ST-15)
   - Problem: docs/07 sends `circle.center: {lat, lng}`; Places API (New) requires `{ latitude, longitude }`, so the Phase 2 seed script gets INVALID_ARGUMENT.
   - Fix: Fix docs/07 §1 step 2 to `center: { latitude, longitude }`.
   - Superseded 2026-10-25: Text Search now sends `locationRestriction` (a rectangle), not a circle bias.
8. **Restaurant merge collides with unique constraints** (AP-18, PL-19)
   - Problem: Merging two restaurants that serve the same dish, or that one user rated at both, violates `@@unique([restaurantId, dishId])` and `@@unique([restaurantDishId, userId])`; Prompt 3 ships merge in Phase 2.
   - Fix: One transaction: keep the stronger RD status, min price, union tags; on a rater collision keep the newer rating and log the other in RatingHistory; recompute; mark B DUPLICATE.

## Later

### Phase 1 (not blocking)

- **TX-17** (major) Generic one-word and brand aliases map semantically different items to a dish at confidence 1.0.
  Claim: A menu line 'Beef Steak' (substring) or 'Mango Shake', 'Kashmiri Chai', 'Aloo Paratha', 'Zinger Roll', 'Steam Roast' hits an exact/substring alias and auto-creates a MENU_VERIFIED RestaurantDish for chicken-steak, fresh-juice, chai (doodh patti), anda-paratha, kabab-paratha-roll, chargha respectively — items a diner would not call the same dish. 'al baik' is a brand name, not …
  Default: Delete the aliases listed; keep generic words only where rule 4 is true (biryani→chicken, nihari→beef). Add a seed test that flags one-word aliases for manual review.
  Where: seed/dishes.json § chicken-steak / fresh-juice / chai / anda-paratha / kabab-paratha-roll / chargha / broast; docs/05-DISH-TAXONOMY.md § Rules of the taxonomy, rule 4; docs/05-DISH-TAXONOMY.md § Matching pipeline, step 5.
- **ST-24** (minor) CLAUDE.md requires cuid2 ids but docs/03 uses `cuid()` (v1); Prisma supports `cuid(2)` natively.
  Where: CLAUDE.md § Conventions; docs/03-DATA-MODEL.md § Prisma schema, model User; stack-facts.md § npm `latest` dist-tags today.
- **TX-15** (minor) Seed violates rule 1: 'beef qorma' maps to mutton-qorma and 'veg/egg fried rice' map to chicken-fried-rice.
  Where: docs/05-DISH-TAXONOMY.md § Rules of the taxonomy, rule 1; seed/dishes.json § mutton-qorma; seed/dishes.json § chicken-fried-rice.

### Phase 2 (not blocking)

- **TX-14** (major) Restaurant search spec relies on admin-entered restaurant aliases that have no column and no admin input.
  Claim: Restaurant has no `aliases` field (Dish does), the admin create/patch payloads have no alias input, and no UI in Phase 2 collects alternative names, so searchText can only ever contain the name; the documented Roman-Urdu tolerance for restaurants rests entirely on trigram similarity to the name.
  Default: Add `aliases String[] @default([])` to Restaurant, include it in adminRestaurantInput and the /admin/restaurants edit form, and recompute searchText on write.
  Where: docs/05-DISH-TAXONOMY.md § Restaurant search (Roman Urdu tolerant); docs/03-DATA-MODEL.md § Prisma schema — model Restaurant; docs/06-API-SPEC.md § Admin (role ADMIN).
- **OP-31** (minor) Google Places assumptions need re-verification: free-cap numbers may be stale, IP-restricting the key is impossible for Vercel functions and a laptop script, and the cost line assumes caps hold.
  Where: docs/07-DATA-PIPELINES.md § 1. Finding candidates with Google Places (New); docs/07-DATA-PIPELINES.md § 1. Finding candidates with Google Places (New); docs/10-DEPLOYMENT.md § Accounts to create.
- **PL-32** (minor) Places budget math counts Islamabad only (~20 areas) while the seed has 30 areas across two cities; re-runs can exceed the Text Search Pro free tier.
  Where: docs/07-DATA-PIPELINES.md § 1. Finding candidates with Google Places (New); seed/areas.json § areas (islamabad: 20, rawalpindi: 10); docs/10-DEPLOYMENT.md § Cost estimate (first 6 months).

### Phase 3

- **AP-07** (major) Endpoint coverage: most docs/06 endpoints are assigned to no prompt, and prompts add routes docs/06 lacks.
  Claim: Grepping docs/09 for `/api/v1` finds only six paths (restaurants/search, restaurants/:slug, ratings, uploads/sign, owner/restaurants/:id/menus, flags) plus Prompt 4's list (restaurant-dishes, proposals, me/ratings). Never assigned to any prompt: `GET /api/v1/cities`, `GET /api/v1/dishes` (which docs/05 says the rate flow calls), `GET /api/v1/rankings`, `GET …
  Default: Scope v1 route handlers to what a browser client needs (`cities`, `dishes`, `restaurants/search`, `restaurants/:slug`, `rankings`, `ratings`, `restaurant-dishes`, `flags`, `proposals`, `uploads/sign`, `me/ratings`); admin/owner operations are server actions only and the docs/06 …
  Where: docs/06-API-SPEC.md § ## Public (no auth); docs/06-API-SPEC.md § ## Admin (role ADMIN); docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 4 — Phase 3: rating flow.
- **AP-09** (major) No prompt builds /admin/users or PATCH /api/v1/admin/users/:id (or admin rating/RD patches), yet Phase 6 and launch require admin-set trust and bans.
  Claim: Prompts 3, 5, 6 and 7 build /admin/import, /admin/restaurants, /admin/rankings, /admin/review, /admin/menu-uploads/[id] and the /admin dashboard, but nothing builds the users page, the users PATCH, the admin ratings PATCH (A3 'hide ratings') or the admin restaurant-dishes PATCH listed in docs/06 and docs/02.
  Default: Add to Prompt 7: '/admin/users: search by email/name; set trustScore (0.3–1.5), role, ban/unban via server action `adminUpdateUser` with Zod `adminUserPatch`; rating status control (ACTIVE/HELD/HIDDEN) on the review-item panel'; keep the JSON handlers deferred per AP-07.
  Where: docs/06-API-SPEC.md § ## Admin (role ADMIN); docs/02-ARCHITECTURE.md § ## Directory structure; docs/08-IMPLEMENTATION-PLAN.md § ## Phase 6 — Owner area + hardening + launch (8–10 h).
- **AP-10** (major) Public profile endpoint: `username` is never assigned, and a per-user rating list contradicts 'no rater identities anywhere'; comments have no display surface.
  Claim: No endpoint, page or Auth.js callback sets `username` (Google supplies name/email/image only), so the route can never resolve; and if it did, a public user→ratings list lets an owner (who is also a public visitor) identify who rated their dishes, which docs/07 §4, docs/11 and Prompt 7 forbid. Separately, no endpoint or page displays `Rating.comment` to anyone but its author …
  Default: Remove `GET /api/v1/users/:username` and the `username` column from v1; state in docs/01 that ratings are pseudonymous and that comments appear on the restaurant page as unattributed quotes ('a diner wrote…') only after moderation (see AP-19).
  Where: docs/06-API-SPEC.md § ## Public (no auth); docs/03-DATA-MODEL.md § ## Prisma schema (authoritative — copy into `prisma/schema.prisma`); docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 7 — Phase 6: owner area, hardening, launch prep.
- **AP-11** (major) Rate limiting: 1-hour buckets cannot enforce the per-minute search limit; several write paths have no key; no bucket cleanup; '(key, action)' vs the model.
  Claim: With fixed 1-hour buckets a 120/min limit degrades to 120/hour (or needs a bucket size Prompt 4 does not provide); docs/02 describes a `(key, action)` pair while the model has only `key`; the table defines no key for owner claims, menu creation, owner RD patch, rating deletion or the dispute form, so rule 7 cannot be satisfied from the spec; `ip:{hash}:api` means every public …
  Default: `assertRateLimit(key, limit, windowSeconds)` uses bucket size `max(10 s, windowSeconds/6)` (10 s buckets for the per-minute limit, 1 h for daily); add keys `user:{id}:claim` 3/day, `user:{id}:owner-edit` 200/day, menus counted under `user:{id}:upload`, `user:{id}:delete-rating` …
  Where: docs/06-API-SPEC.md § ## Rate limits (`src/server/rate-limit.ts`, DB sliding window); docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 4 — Phase 3: rating flow; docs/02-ARCHITECTURE.md § ## Cross-cutting.
- **AP-12** (major) IP hashing is undefined: no secret, no header source, no retention; the privacy checklist omits it.
  Claim: The kit stores an IP hash on every rating and keys public limits by IP hash, but never says which request header yields the client IP on Vercel, what hash/keying is used, or how long it is kept. An unsalted hash of an IPv4 address is reversible by enumerating 2^32 values, so it is personal data, and the privacy checklist does not list it. Trusting the first value of …
  Default: Add `IP_HASH_SECRET` to docs/10; `ipHash = hmacSha256(IP_HASH_SECRET, ip).slice(0, 32)` with `ip` from `x-real-ip` on Vercel (last hop of `x-forwarded-for` as fallback); null it out after 90 days in the nightly job; list 'hashed IP address at rating time' on the privacy page; …
  Where: docs/03-DATA-MODEL.md § ## Prisma schema (authoritative — copy into `prisma/schema.prisma`); docs/06-API-SPEC.md § ## Rate limits (`src/server/rate-limit.ts`, DB sliding window); docs/10-DEPLOYMENT.md § ## Environment variables (`.env.example`).
- **AP-19** (major) Comment moderation: Prompt 4 puts the whole rating on HELD for a URL in the comment; docs/04/07 say only the comment is hidden; no ReviewItem type or column exists for it.
  Claim: `RatingStatus.HELD` removes the score from the ranking, so a legitimate 9/10 whose comment contains a phone number is dropped from compute, whereas docs/04 and docs/07 only want the comment hidden. The ReviewItem type to create is unspecified (SUSPICIOUS_RATINGS' payload is for bursts), and no column records that a comment is hidden or approved.
  Default: Add `commentStatus CommentStatus @default(VISIBLE)` (`VISIBLE | HIDDEN_PENDING | HIDDEN | APPROVED`) to Rating and `ReviewItemType.COMMENT_REVIEW` with payload `{ ratingId, reason: 'phone'|'url'|'blocklist' }`; rating status stays ACTIVE; update docs/03, docs/06 (ratings …
  Where: docs/04-RANKING.md § ## Abuse controls (in RatingService, before compute); docs/07-DATA-PIPELINES.md § ## 5. Freshness and hygiene jobs (nightly recompute, docs/04); docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 4 — Phase 3: rating flow.
- **OP-13** (major) No phase builds the admin user tools (/admin/users, PATCH admin/users, PATCH admin/ratings) needed to set panel trust and ban users, and the nightly trust recompute would overwrite admin-set trust because the schema has no panel/override flag.
  Claim: docs/08 Phases 2–6 and Prompts 3–7 list /admin/import, /admin/restaurants, /admin/rankings, /admin/review, /admin/menu-uploads and an /admin dashboard, but never /admin/users nor the admin users/ratings PATCH endpoints; the only way to give the panel trust 1.3 (Phase 6 acceptance, docs/11 launch item) is a manual DB edit, and docs/04's nightly recompute 'from these rules' …
  Default: Add `isPanel Boolean @default(false)` and `trustOverride Float?` to User in docs/03; nightly recompute uses trustOverride when set and 1.3 when isPanel; add '/admin/users: search, set panel/trust/role/ban; hide/release/HELD ratings' plus the two PATCH endpoints to Prompt 6 …
  Where: docs/02-ARCHITECTURE.md § Directory structure; docs/01-PRODUCT-SPEC.md § User stories (v1 — all must be met before launch) / Admin; docs/06-API-SPEC.md § Admin (role ADMIN).
- **PL-03** (major) 'STALE → USER_CONFIRMED on new rating' exists only in the state diagram; recomputeOne promotes only CANDIDATE.
  Claim: No service rule anywhere moves a STALE row back to USER_CONFIRMED when it receives a rating; the only promotion rule is gated on status = CANDIDATE, and POST /ratings only describes the 'RD does not exist' case.
  Default: In RatingService.createOrReplace: if rd.status == STALE → set USER_CONFIRMED and lastVerifiedAt = now() before recomputeOne (a single rating revives, as the diagram states); add the unit test 'rating a STALE row revives it' to docs/04's list and Prompt 4 item 9.
  Where: docs/02-ARCHITECTURE.md § RestaurantDish lifecycle; docs/diagrams/restaurant-dish-lifecycle.mmd § stateDiagram-v2; docs/04-RANKING.md § `recomputeOne(restaurantDishId)` — on every rating write.
- **PL-06** (major) REMOVED is terminal but unique(restaurantId, dishId) plus 'no-op if exists' blocks re-adding; rating a REMOVED RD is undefined; owners can delete a badly ranked dish.
  Claim: Once a row is REMOVED (by flags or by the owner) no user path can recreate it: add-dish is a no-op on the existing row and POST /ratings has no error code or behaviour for a REMOVED RD. Meanwhile an owner can set REMOVED on a dish that ranks badly, which hides it from the ranking without admin review, contradicting the 'cannot change scores' spirit.
  Default: POST /ratings and POST /restaurant-dishes on a REMOVED RD → `AppError('DISH_REMOVED', 409)` with UI copy 'This dish was marked as no longer served — report if wrong' (creates a FLAG with reason OTHER); only admin PATCH may revive (REMOVED → CANDIDATE). Owner removal stays …
  Where: docs/02-ARCHITECTURE.md § RestaurantDish lifecycle; docs/03-DATA-MODEL.md § Prisma schema — model RestaurantDish; docs/06-API-SPEC.md § Authenticated (role USER+) — POST /api/v1/restaurant-dishes.
- **PL-07** (major) 'Status transitions are recorded' and 'remove with reason' have no table or field in the schema.
  Claim: docs/03 (authoritative schema) has history only for ratings (RatingHistory), review items and job runs; RestaurantDish has no removedReason/removedAt and there is no RestaurantDishEvent/AuditLog model, so promotions, stale marking, flag removals, owner confirm/remove 'with reason' and admin status edits cannot be recorded as the docs promise.
  Default: Add in Phase 1: `model RestaurantDishEvent { id, restaurantDishId, fromStatus, toStatus, source SourceType, byUserId?, reason?, createdAt }` written by every transition (recomputeOne promotion, stale job, flag uphold, owner/admin PATCH, menu upsert, merge). Mention it in docs/03 …
  Where: docs/02-ARCHITECTURE.md § Principles; docs/07-DATA-PIPELINES.md § 4. Owner claim; docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 7 — Phase 6: owner area, hardening, launch prep.
- **PL-11** (major) Comment screening: 'comment hidden pending review' (docs/04, docs/07) vs 'rating status HELD + ReviewItem' (Prompt 4); no ReviewItem type or field exists for comments or the extreme-score pattern.
  Claim: docs/04 and docs/07 hide only the comment; Prompt 4 sets the whole rating HELD, which (per docs/04 burst rule and docs/11) excludes the score from compute. Rating has no comment-status field, and no ReviewItemType fits a comment review or the nightly extreme-score flag ('until reviewed' implies a queue item).
  Default: Keep the score ACTIVE; add `Rating.commentStatus` enum (VISIBLE | HELD | HIDDEN) set to HELD by the regex; create ReviewItem SUSPICIOUS_RATINGS with payload reason 'COMMENT' (payload already has `reason`) and resolve actions 'show comment / hide comment'; the extreme-score job …
  Where: docs/04-RANKING.md § Abuse controls (in RatingService, before compute); docs/07-DATA-PIPELINES.md § 5. Freshness and hygiene jobs (nightly recompute, docs/04); docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 4 — Phase 3: rating flow.
- **PL-12** (major) Burst detection: docs/04 holds all qualifying ratings, tests and acceptance hold only the 5th.
  Claim: 'set those ratings HELD' means all ≥5 young-account ratings in the window are held; the three test/acceptance statements only require the 5th. Which set goes into SUSPICIOUS_RATINGS.ratingIds[] and what 'release'/'hide' act on depends on the choice.
  Default: Follow docs/04: hold every rating in the 24h window from accounts < 7 days old (including the first four, retroactively) and list all their ids in one SUSPICIOUS_RATINGS item; change the test/acceptance wording to 'all five are HELD'. Exempt admin-set trust ≥ 1.3 users (see …
  Where: docs/04-RANKING.md § Abuse controls (in RatingService, before compute); docs/04-RANKING.md § Unit tests required (`tests/unit/ranking/`); docs/08-IMPLEMENTATION-PLAN.md § Phase 3 — Rating flow (8–10 h) — Acceptance.
- **RK-03** (major) recomputeOne SQL returns `count(DISTINCT 1) AS placeholder` — a constant 0/1, not distinctRaters.
  Claim: In PostgreSQL `count(DISTINCT 1)` counts distinct non-null values of the literal 1, i.e. returns 1 when any row exists and 0 otherwise. Prompt 4 instructs using 'the SQL from docs/04' verbatim; the column named placeholder has no defined consumer, and the prose says distinctRaters is 'computed separately' without saying how.
  Default: Replace the line with `count(DISTINCT rt."userId") AS distinct_raters` and map it to RestaurantDish.distinctRaters; keep ratingCount = count(*). Add a unit test that two ratings from the same user (impossible by constraint, but via history) never count twice.
  Where: docs/04-RANKING.md § recomputeOne(restaurantDishId) — on every rating write; docs/04-RANKING.md § recomputeOne(restaurantDishId) — on every rating write; docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 4 — Phase 3: rating flow.
- **RK-04** (major) Decay clock is Rating.updatedAt (@updatedAt), so admin status edits reset a rating's age and re-submitting the same score defeats decay for free.
  Claim: Prisma's @updatedAt is bumped on every update() of the row, including status-only changes (HELD → ACTIVE release, HIDDEN), comment moderation, or any backfill. Using it as the decay clock means (a) releasing a held rating or hiding/unhiding one resets its age to 0, and (b) a user can re-submit an unchanged score every few months (allowed: 'edit replaces') to restore full …
  Default: Add `Rating.ratedAt DateTime` set by RatingService only when the user submits or changes the score (and set equal to createdAt on insert); use ratedAt in the decay and in lastRatedAt; keep updatedAt for audit. Optionally only refresh ratedAt when the score actually changes.
  Where: docs/04-RANKING.md § Inputs; docs/04-RANKING.md § recomputeOne(restaurantDishId) — on every rating write; docs/03-DATA-MODEL.md § Prisma schema — model Rating.
- **RK-05** (major) Burst rule holds 'those ratings' (all) in docs/04 but only 'the 5th rating' in docs/04 tests, docs/08 and docs/09.
  Claim: docs/04 (plural 'those ratings', 'with the rating ids', payload ratingIds[]) holds every young-account rating in the window and requires re-running recomputeOne for the RD; docs/04's test line, docs/08 and docs/09 hold only the 5th, leaving the first four ACTIVE (already aggregated and able to promote CANDIDATE → USER_CONFIRMED at 3 raters). The docs also do not say whether …
  Default: Follow docs/04: hold all ratings from young accounts in the 24h window (the 5th included), then run recomputeOne; window on Rating.createdAt; one OPEN SUSPICIOUS_RATINGS per RD (append ratingIds while OPEN). Reword docs/08/09 and the test to 'the 5th rating triggers a hold of …
  Where: docs/04-RANKING.md § Abuse controls (in RatingService, before compute); docs/04-RANKING.md § Unit tests required; docs/08-IMPLEMENTATION-PLAN.md § Phase 3 — Acceptance.
- **RK-07** (major) Burst window of 24h is trivially bypassed: 9 sock-puppet accounts at 4/day over 3 days reach W = 5.4 ≥ 5 and 9 ≥ 8 raters, and all-10s outrank a legitimate 40-vote restaurant.
  Claim: Nine new Google accounts each rating once (4 on day 1, 4 on day 2, 1 on day 3) never trigger the 24h/5 rule, never trigger the extreme-score rule (each has 1 rating), and produce W = 9 × 0.6 = 5.4 ≥ 5.0 with 9 distinct raters ≥ 8, so the row is eligible. With R = 10 and C = 7.0 the score is (5.4/13.4)×10 + (8/13.4)×7 = 8.21, above a legitimate row with 40 fresh trust-1.0 …
  Default: Evaluate the burst rule over a 7-day window (same as the account-age window): if ≥ 5 young-account ratings (RK-06 definition) land on one RD within 7 days, hold them and open SUSPICIOUS_RATINGS. Keep the 24h test as the stricter sub-case. Record the decision in OPEN-QUESTIONS.
  Where: docs/04-RANKING.md § Goal (intro); docs/04-RANKING.md § Eligibility (to show a rank number); docs/04-RANKING.md § Trust score (per user).
- **RK-13** (major) STALE revival is defined differently in docs/02 (any new rating → USER_CONFIRMED) and docs/04 (promotion only from CANDIDATE), and the stale clock for never-rated rows is undefined.
  Claim: Under docs/04, a STALE row that receives new ratings stays STALE forever (promotion checks status = CANDIDATE only) and STALE is not an eligible status, so it never ranks again. Under docs/02, one new rating makes it USER_CONFIRMED immediately, bypassing the 3-distinct-rater rule that every other path requires. Additionally 'no rating or verification in 270 days' has no …
  Default: recomputeOne treats STALE like CANDIDATE: on a new ACTIVE rating, STALE → CANDIDATE, and → USER_CONFIRMED when distinctRaters ≥ 3. Stale age = now − GREATEST(lastRatedAt, lastVerifiedAt, createdAt), 270 days for CANDIDATE/USER_CONFIRMED and 365 for MENU/OWNER_VERIFIED (both …
  Where: docs/02-ARCHITECTURE.md § RestaurantDish lifecycle; docs/04-RANKING.md § recomputeOne(restaurantDishId) — on every rating write; docs/04-RANKING.md § recomputeAll() — nightly cron 02:00 PKT.
- **RK-14** (major) Comment moderation 'hides the comment' in docs/04 and docs/07 but docs/09 sets the whole rating HELD (score dropped from compute); no comment-level state, review type or blocklist exists.
  Claim: Rating has a single status for the whole row, so 'hide the comment' cannot be represented without either nulling the comment or holding the entire rating; Prompt 4 picks the latter, which removes a valid score from W and R because of a phone number in the text (HELD ratings are 'excluded from compute'). No ReviewItemType exists for a comment review and the 'blocklist' is not …
  Default: Keep the rating ACTIVE; at write time move an offending comment into a ReviewItem (type SUSPICIOUS_RATINGS, payload { restaurantDishId, ratingIds:[id], reason:'COMMENT', comment }) and set Rating.comment = NULL until an admin restores it. Blocklist = exported array in …
  Where: docs/04-RANKING.md § Abuse controls (in RatingService, before compute); docs/07-DATA-PIPELINES.md § 5. Freshness and hygiene jobs; docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 4 — Phase 3: rating flow.
- **RK-16** (major) Rating deletion has no defined semantics: a hard delete cascades RatingHistory away and conflicts with 'history kept'/'soft' rules, but RatingStatus has no withdrawn state.
  Claim: If deleteOwn hard-deletes the Rating, RatingHistory rows cascade and the audit trail (docs/02 'Everything auditable') is lost; trust counters and burst/ReviewItem ratingIds dangle. If it is soft, no status value represents 'withdrawn by user', and @@unique([restaurantDishId, userId]) means a later re-rate must reactivate the same row. Neither docs/04 nor docs/06 says which, …
  Default: Add `RatingStatus.WITHDRAWN`; user delete = status WITHDRAWN + RatingHistory row (excluded from compute like HELD/HIDDEN; not deletable while HELD); re-rating reactivates the row and sets ratedAt; hard delete only on account deletion.
  Where: docs/06-API-SPEC.md § Authenticated (role USER+); docs/01-PRODUCT-SPEC.md § Screens (routes); CLAUDE.md § Glossary.
- **RK-17** (major) Rate limiter with 1-hour buckets cannot enforce the 120/min search limit in docs/06.
  Claim: A bucket granularity of one hour cannot answer 'how many requests in the last 60 seconds'; with 1-hour buckets the search limit becomes either 120/hour (too strict by 60×) or unenforced. The per-day limits (15, 3, 10, 20) are fine with hourly buckets, so the single granularity in Prompt 4 contradicts the docs/06 table.
  Default: Derive bucket size from the window in assertRateLimit: bucketSeconds = max(5, floor(windowSeconds / 12)) (5 s buckets for 1 min, 5 min for 1 h, 2 h for 1 day); sum buckets with windowStart ≥ now − window; purge rows older than the longest window nightly.
  Where: docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 4 — Phase 3: rating flow; docs/06-API-SPEC.md § Rate limits; docs/03-DATA-MODEL.md § Prisma schema — model RateLimitBucket.
- **AP-06** (minor) CSRF item targets the wrong surface: Server Actions already check Origin, while cookie-authenticated JSON route handlers have no stated protection.
  Where: docs/08-IMPLEMENTATION-PLAN.md § ## Phase 6 — Owner area + hardening + launch (8–10 h); docs/06-API-SPEC.md § intro (before ## Rate limits); docs/11-REVIEW-CHECKLIST.md § ## Security.
- **AP-25** (minor) Banned users can still sign in and write; requireUser() does not check bannedAt and sessions are not revoked.
  Where: docs/03-DATA-MODEL.md § ## Prisma schema (authoritative — copy into `prisma/schema.prisma`); docs/04-RANKING.md § ## Trust score (per user); docs/07-DATA-PIPELINES.md § ## 6. Review queue — payloads and resolutions.
- **AP-26** (minor) Burst rule: docs/04 holds all ratings in the burst, but its test list, docs/08 and Prompt 4 hold only 'the 5th'; 'new-account limits' in the diagram are undefined.
  Where: docs/04-RANKING.md § ## Abuse controls (in RatingService, before compute); docs/04-RANKING.md § ## Unit tests required (`tests/unit/ranking/`); docs/08-IMPLEMENTATION-PLAN.md § ## Phase 3 — Rating flow (8–10 h).
- **AP-27** (minor) Where the rate limit runs: the sequence diagram puts it in the server action, Prompt 4 in the service; route handlers share only the service.
  Where: docs/02-ARCHITECTURE.md § ### Rating submission; docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 4 — Phase 3: rating flow; CLAUDE.md § ## Conventions.
- **AP-28** (minor) POST /api/v1/restaurant-dishes lets any user set free-text menuName and price that reach public pages; Prompt 4's UI never collects them.
  Where: docs/06-API-SPEC.md § ## Authenticated (role USER+); docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 4 — Phase 3: rating flow; docs/06-API-SPEC.md § ## Public (no auth).
- **AP-29** (minor) DELETE /api/v1/ratings/:id is unspecified as hard vs soft; docs/10 says only GDPR deletes are hard and RatingStatus has no DELETED.
  Where: docs/06-API-SPEC.md § ## Authenticated (role USER+); docs/10-DEPLOYMENT.md § ## Backups and safety; docs/03-DATA-MODEL.md § ## Prisma schema (authoritative — copy into `prisma/schema.prisma`).
- **AP-31** (minor) Photo path validation under-specified: image/* admits SVG/HEIC, no path regex, no existence check, and one photo can be reused across ratings to farm trust.
  Where: docs/06-API-SPEC.md § ## Authenticated (role USER+); docs/04-RANKING.md § ## Trust score (per user); docs/11-REVIEW-CHECKLIST.md § ## Security.
- **AP-32** (minor) Error/response contract gaps: no code→status table, `held` missing from the ratings response, envelope and diagram shapes disagree, proposals ids vs slugs.
  Where: docs/06-API-SPEC.md § intro (before ## Rate limits); docs/06-API-SPEC.md § ## Authenticated (role USER+); docs/02-ARCHITECTURE.md § ### Rating submission.
- **AP-33** (minor) Zod schema list omits half the endpoint inputs, and Prompt 2 builds 'everything listed' in Phase 1.
  Where: docs/06-API-SPEC.md § ## Zod schemas (`src/server/validation/`); docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 2 — Phase 1: schema, seed, matching; docs/06-API-SPEC.md § ## Admin (role ADMIN).
- **AP-34** (minor) No audit record for admin mutations (users, ratings, restaurants, RDs) despite 'everything auditable' and rule 7; Vercel logs are short-lived.
  Where: docs/02-ARCHITECTURE.md § ## Principles; CLAUDE.md § ## Non-negotiable rules; docs/02-ARCHITECTURE.md § ## Cross-cutting.
- **OP-24** (minor) docs/06 endpoints and docs/02 e2e specs that no prompt produces (public JSON API for cities/dishes/rankings, admin and owner PATCH/GET endpoints, users/:username, the three Playwright specs and the auth bypass they need).
  Where: docs/06-API-SPEC.md § Public (no auth); docs/06-API-SPEC.md § Public (no auth); docs/06-API-SPEC.md § Owner (role OWNER or ADMIN).
- **OP-27** (minor) Burst-detection acceptance wording differs: docs/08 and Prompt 4 hold 'the 5th rating', docs/04 holds all qualifying ratings.
  Where: docs/08-IMPLEMENTATION-PLAN.md § Phase 3 — Rating flow / Acceptance; docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 4 — Phase 3: rating flow / Acceptance; docs/04-RANKING.md § Abuse controls (in RatingService, before compute).
- **OP-28** (minor) Rate limiter specified with 1-hour buckets cannot enforce docs/06's 120/min search limit, and IP-keyed limits need a hashing salt no doc lists.
  Where: docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 4 — Phase 3: rating flow; docs/06-API-SPEC.md § Rate limits (`src/server/rate-limit.ts`, DB sliding window); docs/03-DATA-MODEL.md § Prisma schema (authoritative — copy into `prisma/schema.prisma`).
- **PL-27** (minor) Proposals: DISH_PROPOSAL payload has restaurantId the endpoint cannot receive; no entry point for RESTAURANT_PROPOSAL; phase placement differs between docs/08 and Prompt 4.
  Where: docs/06-API-SPEC.md § Authenticated (role USER+) — POST /api/v1/proposals; docs/07-DATA-PIPELINES.md § 6. Review queue — payloads and resolutions; docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 4 — Phase 3: rating flow.
- **RK-19** (minor) Rating-flow diagram runs the rating upsert before the owner-self-rating check, places the rate limit in the action rather than the service, and names undefined 'new-account limits'.
  Where: docs/02-ARCHITECTURE.md § Key flows — Rating submission; docs/diagrams/rating-flow.mmd § sequenceDiagram; docs/04-RANKING.md § Abuse controls (in RatingService, before compute).
- **RK-23** (minor) Worked example row C: 'half are a year old' at trust 1.0 gives W ≈ 24.9 (score 7.81), not W ≈ 28 (7.82).
  Where: docs/04-RANKING.md § Worked example; docs/04-RANKING.md § Weight of a rating.
- **RK-24** (minor) Half-life and decay constants are hard-coded in the recomputeOne SQL although 'all constants live in ranking.constants.ts'.
  Where: docs/04-RANKING.md § intro; docs/04-RANKING.md § recomputeOne(restaurantDishId) — on every rating write; docs/04-RANKING.md § recomputeAll() — nightly cron 02:00 PKT.
- **RK-25** (minor) Rating.weight 'trust weight at write time' (default 1) contradicts trust 'at compute time' in docs/04 and is never read; ERD lists weight but not rawMean.
  Where: docs/03-DATA-MODEL.md § Prisma schema — model Rating; docs/03-DATA-MODEL.md § ERD; docs/04-RANKING.md § Inputs.
- **RK-28** (minor) recomputeOne divides weightedScoreSum by weightSum with no W = 0 rule; score must become NULL when all ratings are held/hidden/withdrawn.
  Where: docs/04-RANKING.md § recomputeOne(restaurantDishId) — on every rating write; docs/03-DATA-MODEL.md § Invariants (enforce in services + tests); docs/04-RANKING.md § recomputeAll() — nightly cron 02:00 PKT.
- **TX-25** (minor) Dish search ordering: 'launch dishes boosted' (docs/05) vs 'sorted launch first' (docs/06).
  Where: docs/05-DISH-TAXONOMY.md § Adding a dish to a restaurant from the rate flow, step 1; docs/06-API-SPEC.md § GET /api/v1/dishes.
- **TX-26** (minor) DISH_PROPOSAL submitted from the rate flow cannot carry the restaurant the user was rating.
  Where: docs/06-API-SPEC.md § POST /api/v1/proposals; docs/07-DATA-PIPELINES.md § 6. Review queue — payloads and resolutions; docs/05-DISH-TAXONOMY.md § Adding a dish to a restaurant from the rate flow, step 4.

### Phase 4

- **ST-01** (blocker) Next.js App Router has no partial dynamic segment: folder `best-[dish]` is not a route for /islamabad/best-chicken-karahi.
  Claim: Next.js 16.4 App Router only recognises a dynamic segment when the entire folder name is `[name]`, `[...name]` or `[[...name]]`; a folder named `best-[dish]` is a literal segment, so `/islamabad/best-chicken-karahi` cannot be served by the directory layout in docs/02 and Prompt 5.
  Default: Keep the public URL. Implement `src/app/(public)/[city]/[dishPath]/page.tsx` that calls `notFound()` unless `dishPath` starts with `best-`, strips the prefix and loads the dish (the static `r/` segment still wins for restaurant pages); …
  Where: docs/01-PRODUCT-SPEC.md § Screens (routes); docs/02-ARCHITECTURE.md § Directory structure; docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 5 — Phase 4, step 2.
- **AP-08** (major) Dispute flow is undefined: no ReviewItem type fits, FLAG needs an RD and Flag rows, 'anyone' vs auth, no rate-limit key, no email provider.
  Claim: A dispute from the footer page has no `restaurantDishId`, often no signed-in user, and needs a reply address; the FLAG payload and the Flag model's required FKs cannot represent it, no ReviewItemType exists for it, no limit key exists for this anonymous write path (CLAUDE.md rule 7), and 'email to ADMIN_EMAIL' has no mail provider anywhere in the stack, env list or directory …
  Default: Add `ReviewItemType.DISPUTE` with payload `{ contactEmail, restaurantSlug?, dishSlug?, message (≤ 1000 chars) }`; endpoint `POST /api/v1/disputes` public (auth optional, `createdByUserId` set when signed in), Zod `disputeInput`, limit `ip:{hash}:dispute` 3/day; no email in v1 — …
  Where: docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 5 — Phase 4: ranking pages, SEO, nightly recompute; docs/01-PRODUCT-SPEC.md § ## Trust rules shown to users; docs/07-DATA-PIPELINES.md § ## 6. Review queue — payloads and resolutions.
- **AP-20** (major) 'async, returns JobRun id' for admin recompute needs waitUntil/after() on Vercel; function duration limits are not considered for recompute + vision parse.
  Claim: A Vercel serverless function may be frozen or terminated once the response is sent, so a fire-and-forget `recomputeAll()` after returning the JobRun id is unreliable unless registered with `waitUntil` (or Next's `after()`), and even then it is bounded by the function's maximum duration; adding up to 20 vision calls to the same nightly job pushes the cron toward that bound with …
  Default: Run `recomputeAll()` synchronously inside the request with `export const maxDuration` documented in docs/10; return `{ jobRunId, ok, summary }`; give vision parsing its own cron path and JobRun; make `recomputeAll` resumable per (city, dish) so a timed-out run can be …
  Where: docs/06-API-SPEC.md § ## Admin (role ADMIN); docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 5 — Phase 4: ranking pages, SEO, nightly recompute; docs/04-RANKING.md § ### `recomputeAll()` — nightly cron 02:00 PKT (and `pnpm rankings:recompute`).
- **OP-16** (major) The documented folder `app/(public)/[city]/best-[dish]/page.tsx` is a partially-dynamic route segment, which Next.js does not support.
  Claim: Dynamic segments must be the whole folder name (`[dish]`); a folder named `best-[dish]` is not a dynamic segment with a static prefix, so the tree in docs/02 cannot produce `/islamabad/best-chicken-karahi`.
  Default: Keep the public URL; implement as `[city]/[page]/page.tsx` (or `[city]/[...slug]`) that parses the `best-<dishSlug>` segment and calls `notFound()` otherwise, with `generateStaticParams` over city × launch dishes; update the docs/02 tree and docs/11 wording to separate URL from …
  Where: docs/02-ARCHITECTURE.md § Directory structure; docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 5 — Phase 4: ranking pages, SEO, nightly recompute; docs/11-REVIEW-CHECKLIST.md § SEO.
- **OP-18** (major) Dev-only scripts are guarded on NODE_ENV, which does not protect production data (a local run with the prod DATABASE_URL passes), and `.env.example` ships a NODE_ENV line Next.js manages itself.
  Claim: The fake-ratings script never runs on Vercel; it runs on the laptop where NODE_ENV is 'development', so the guard is always satisfied even when `.env` points at the production database — the one scenario that matters; fabricated ratings in production would breach rule 3. NODE_ENV is set by `next dev/build/start` and belongs neither in .env.example nor as a safety switch.
  Default: Remove NODE_ENV from .env.example; guard dev scripts with an explicit `ALLOW_DEV_SCRIPTS=1` plus a DATABASE_URL host allow-list (refuse hosts matching the prod project ref, refuse if `VERCEL_ENV === 'production'`); tag fake users (e.g. `*@dev.local`) so they can be purged; …
  Where: docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 5 — Phase 4: ranking pages, SEO, nightly recompute / Acceptance; docs/11-REVIEW-CHECKLIST.md § Security; docs/10-DEPLOYMENT.md § Environment variables (`.env.example`).
- **OP-19** (major) /dispute as specified needs an email provider that is not in the stack and a FLAG review item that requires a signed-in user and a RestaurantDish; anonymous disputes have no rate-limit key.
  Claim: CLAUDE.md §Stack and docs/10 env list contain no email service, so 'email to ADMIN_EMAIL' cannot be implemented; a FLAG payload needs restaurantDishId and flag ids while a dispute about a ranking has neither and the Flag model needs a userId although docs/01 says anyone can dispute; docs/06 defines no `ip:*:dispute` rate limit for an anonymous write.
  Default: v1 dispute = form (page URL, message, optional contact email; sign-in optional) that creates `ReviewItem` type FLAG with payload `{ kind: 'DISPUTE', url, message, contactEmail }` and no Flag row, rate-limited by `ip:{hash}:dispute` 3/day (add to docs/06); no outbound email — the …
  Where: docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 5 — Phase 4: ranking pages, SEO, nightly recompute; docs/01-PRODUCT-SPEC.md § Trust rules shown to users; docs/07-DATA-PIPELINES.md § 6. Review queue — payloads and resolutions.
- **PL-10** (major) /dispute cannot be a FLAG review item; D7 'wrong restaurant' and the WRONG_DISH/DUPLICATE/OTHER reasons have no resolution effect; no email provider in the stack.
  Claim: A FLAG review item carries flagIds that must reference Flag rows, which require a restaurantDishId and a signed-in userId; a dispute from the public static /dispute page may come from a signed-out visitor and concern a restaurant, a rating, a comment or the site, not an RD. Separately, D7's 'wrong restaurant' maps to no FlagReason (WRONG_DISH is about the dish), and docs/07 §6 …
  Default: Add ReviewItemType DISPUTE with payload `{ name?, email?, url?, message }` (no Flag row; allowed signed-out with `ip:{hash}:dispute` 3/day) and drop the email (admin dashboard shows open items; add a provider later). Define: WRONG_DISH upheld → same ×3 rule as NOT_SERVED; …
  Where: docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 5 — Phase 4: ranking pages, SEO, nightly recompute; docs/01-PRODUCT-SPEC.md § Screens (routes); docs/01-PRODUCT-SPEC.md § User stories (v1 — all must be met before launch) — Diner.
- **PL-21** (major) docs/06 shows CANDIDATE rows in rankings.insufficient[] while the docs/04 query and docs/02 exclude CANDIDATE from the ranking page.
  Claim: Under the docs/04 SQL a restaurant with 1–2 ratings (still CANDIDATE) or a Google-seeded candidate never appears on the ranking page under either heading; the docs/06 example row ('votes': 3, status CANDIDATE) is also impossible because 3 distinct active raters promote to USER_CONFIRMED.
  Default: Keep the docs/04 query (CANDIDATE excluded from the ranking page) and fix the docs/06 example to status USER_CONFIRMED; show CANDIDATE rows only on the restaurant page under 'Also serves (unverified)' and in the /rate dish picker. Record the alternative (include CANDIDATE at the …
  Where: docs/06-API-SPEC.md § Public (no auth) — GET /api/v1/rankings; docs/04-RANKING.md § Query for a ranking page; docs/04-RANKING.md § Eligibility (to show a rank number).
- **RK-02** (major) Trust tier 1.2 depends on 'upheld flags against their ratings', which the schema cannot express; no precedence between overlapping trust rows.
  Claim: Flags are raised against a RestaurantDish (reasons NOT_SERVED, WRONG_DISH, RESTAURANT_CLOSED, DUPLICATE, OTHER) and carry the flagger's userId, not a ratingId; there is no entity 'flag against a rating'. The 1.2 condition is therefore not computable from the schema. The table also does not say which row wins when several apply (panel member with 2 hidden ratings: 1.3 or 0.3?), …
  Default: Read 'no upheld flags against their ratings' as 'zero ratings with status HIDDEN'. Evaluate rows in fixed precedence: banned → ≥ 2 HIDDEN (0.3) → trustOverride (RK-01) → 1.2 tier → 1.0 tier → 0.6. In step 1 recompute ratingsCount and photoRatings from ratings with status ACTIVE …
  Where: docs/04-RANKING.md § Trust score (per user); docs/03-DATA-MODEL.md § Prisma schema — model Flag / enum FlagReason; docs/07-DATA-PIPELINES.md § 6. Review queue — payloads and resolutions.
- **RK-08** (major) MIN_RATERS default-trust raters never satisfy MIN_WEIGHT (8 × 0.6 = 4.8 < 5.0; 4 × 0.6 = 2.4 < 2.5), so 'needs N more votes' and `thresholds.minRaters` cannot be stated in votes.
  Claim: For fresh ratings, W per rater at trust 0.6/1.0/1.2/1.3 is 0.6/1.0/1.2/1.3, so 8 default-trust raters give 4.8 (< 5.0) and 4 give 2.4 (< 2.5); a ninth/fifth new-account vote is required. Decay compounds this: 8 trust-1.0 raters fall below W = 5 once their average age exceeds 180 × log2(8/5) ≈ 122 days. Nothing in the docs defines how 'needs N more votes' is computed when …
  Default: Keep the constants. Define N = max(MIN_RATERS − distinctRaters, ceil((MIN_WEIGHT − W) / 0.6)) in ranking.service and expose it as `votesNeeded` in the ratings response and insufficient[] rows; EligibilityNote copy: 'votes are weighted by rater trust and age'. Add unit test '8 …
  Where: docs/04-RANKING.md § Eligibility (to show a rank number); docs/04-RANKING.md § Trust score (per user); docs/06-API-SPEC.md § GET /api/v1/rankings.
- **RK-11** (major) CANDIDATE rows in 'Not enough votes yet' are specified three incompatible ways (docs/06 shows them; docs/04 query excludes them; docs/02 puts them in an undefined 'also serves (unverified)' section).
  Claim: The docs/04 query never returns CANDIDATE rows, so the docs/06 example (a CANDIDATE with 3 votes in insufficient[]) cannot be produced by it; docs/02 instead describes a third section no other doc, page spec or API field mentions, and its sentence contradicts itself ('independent of status' then conditions on status). A user who adds a dish and rates it (CANDIDATE, < 3 raters) …
  Default: Query `rd.status IN ('CANDIDATE','USER_CONFIRMED','MENU_VERIFIED','OWNER_VERIFIED') AND (rd.status <> 'CANDIDATE' OR rd."ratingCount" > 0)`; eligibility unchanged (confirmed statuses + thresholds); CANDIDATE rows with ratings appear in insufficient[]; delete the 'also serves …
  Where: docs/06-API-SPEC.md § GET /api/v1/rankings; docs/04-RANKING.md § Query for a ranking page; docs/02-ARCHITECTURE.md § RestaurantDish lifecycle.
- **ST-03** (major) Kit pins Next.js 15; `latest` is 16.4.2 and several Next 16 changes invalidate Prompt 1/5 instructions.
  Claim: `next@latest` is 16.4.2 (engines node >= 20.9.0) and the `next-15` lines are maintenance tags; Next 16 removes synchronous `params`/`searchParams`, removes `next lint` (and `next build` no longer lints), makes Turbopack the default, renames middleware to proxy, requires a second argument to `revalidateTag`, deprecates `images.domains`, changes `images.qualities` default to …
  Default: Decide Next 16.4 and record ADR-11. Update CLAUDE.md Stack, docs/08 Phase 0 and Prompt 1 to "Next.js 16"; Prompt 1: scripts `dev: next dev`, `build: next build`, `lint: eslint .` with `eslint.config.mjs` and `eslint-config-next@16.4`; `next.config.ts` with …
  Where: CLAUDE.md § Stack (fixed); docs/08-IMPLEMENTATION-PLAN.md § Phase 0 — Scaffold, Tasks; docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 1 — Phase 0, Scope.
- **PL-31** (minor) Trust rule 'no upheld flags against their ratings' cannot be computed because flags target RestaurantDish rows, not ratings.
  Where: docs/04-RANKING.md § Trust score (per user); docs/03-DATA-MODEL.md § Prisma schema — model Flag.
- **RK-10** (minor) Bootstrap window ends on day 60, exactly when the month-2 metric is read; docs/01 does not say which thresholds the metric uses.
  Where: docs/01-PRODUCT-SPEC.md § Success metrics and kill criteria; docs/04-RANKING.md § Eligibility (to show a rank number); docs/11-REVIEW-CHECKLIST.md § Launch day.
- **RK-20** (minor) recomputeAll assigns rankInCity (step 4) before marking stale (step 5), so a row can keep a rank while STALE, violating invariant 3.
  Where: docs/04-RANKING.md § recomputeAll() — nightly cron 02:00 PKT; docs/03-DATA-MODEL.md § Invariants (enforce in services + tests); docs/10-DEPLOYMENT.md § Crons (vercel.json).
- **RK-22** (minor) Weekly snapshot 'Sunday' is evaluated by a job that fires at 21:00 UTC on Saturday; timezone for the day check is unspecified.
  Where: docs/04-RANKING.md § recomputeAll() — nightly cron 02:00 PKT; docs/10-DEPLOYMENT.md § Crons (vercel.json); CLAUDE.md § Conventions.
- **RK-27** (minor) Prior C jumps from the 6.5 fallback to the observed city mean at the 50th rating, shifting every score for that city×dish overnight; inputs to DishStat are under-specified.
  Where: docs/04-RANKING.md § Score (Bayesian average); docs/04-RANKING.md § recomputeAll() — nightly cron 02:00 PKT; docs/03-DATA-MODEL.md § Prisma schema — model DishStat.
- **RK-30** (minor) CLAUDE.md rule 4 requires eligibility 'enforced in the query'; docs/04 and docs/11 split eligibility in the service.
  Where: CLAUDE.md § Non-negotiable rules; docs/04-RANKING.md § Query for a ranking page; docs/11-REVIEW-CHECKLIST.md § Product rules.
- **RK-31** (minor) Restaurant page/API shows a Bayesian score for sub-threshold dishes (a single 10 from a new user shows ≈ 6.7) while the ranking page hides them.
  Where: docs/06-API-SPEC.md § GET /api/v1/restaurants/:slug; docs/01-PRODUCT-SPEC.md § User stories — Diner; docs/04-RANKING.md § Eligibility (to show a rank number).
- **RK-32** (minor) insufficient[] must be ordered by ratingCount/lastRatedAt but the single query orders by score and applies LIMIT 100 before the split.
  Where: docs/04-RANKING.md § Eligibility (to show a rank number); docs/04-RANKING.md § Query for a ranking page; docs/06-API-SPEC.md § GET /api/v1/rankings.

### Phase 5

- **AP-14** (major) uploads/sign has no `restaurantId`, so the server cannot build the `menus/<restaurantId>/` path that docs/07 and Prompt 6 require.
  Claim: The only input that identifies which restaurant a menu photo belongs to is absent from the sign request, so either the client chooses the path (making the docs/11 'prefix + owner' validation impossible) or the endpoint cannot produce the documented path; nothing validates that the restaurant exists and is ACTIVE before signing.
  Default: `uploadSignInput = z.discriminatedUnion('kind', [{ kind: 'dish-photo', contentType, sizeBytes }, { kind: 'menu', restaurantId, contentType, sizeBytes }])`; for `menu` verify the restaurant is ACTIVE and sign `menus/<restaurantId>/<userId>-<cuid>.jpg`; the later MenuUpload …
  Where: docs/06-API-SPEC.md § ## Authenticated (role USER+); docs/07-DATA-PIPELINES.md § ## 3. Menu ingestion (photo → structured menu); docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 6 — Phase 5: menu ingestion + review queue.
- **AP-15** (major) Panel members (role USER) are told to upload menu photos, but the only MenuUpload-creating endpoint is owner-only for 'own' restaurants.
  Claim: `MenuUpload` rows can only be created through an owner-role route scoped to a claimed restaurant; a panel member has role USER and claims nothing, so P2 and §7 have no API path. Meanwhile the `menu` kind of `uploads/sign` is USER+, so files can land in storage with no row referencing them.
  Default: Add `POST /api/v1/menu-uploads { restaurantId, path }` under 'Authenticated (USER+)' (limit `user:{id}:upload`), creating `MenuUpload PENDING` with `uploadedByUserId`; keep the owner route as an alias; parsing of USER-submitted uploads stays admin/cron-triggered as docs/07 …
  Where: docs/07-DATA-PIPELINES.md § ## 3. Menu ingestion (photo → structured menu); docs/06-API-SPEC.md § ## Owner (role OWNER or ADMIN); docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 5 — Phase 4: ranking pages, SEO, nightly recompute.
- **OP-07** (major) Prompts specify Anthropic 'tool-use' JSON extraction, but current Claude models reject forced tool_choice; the model env vars have no defaults so parsing fails when unset.
  Claim: The usual way to guarantee JSON via a tool is `tool_choice: {type:'tool'|'any'}`, which the current model generation (Opus 5.5 / Sonnet 5.5 / Fable 5.1) rejects with 400; with `auto` the model may answer in prose, so the Phase 5 acceptance (≥ 80% auto-matched) becomes unreliable. The kit also leaves both model ids blank with no code default, so an unset variable makes …
  Default: Use structured outputs (`output_config.format` with the docs/07 schema, or `messages.parse`) for both extract_menu and the matcher, keep the docs/07 system prompt; `.env.example` ships defaults `ANTHROPIC_VISION_MODEL=claude-opus-5-5` and `ANTHROPIC_MATCH_MODEL=claude-haiku-5-5` …
  Where: docs/07-DATA-PIPELINES.md § 3. Menu ingestion (photo → structured menu); docs/05-DISH-TAXONOMY.md § Matching pipeline (`src/server/services/matching/`); docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 2 — Phase 1: schema, seed, matching.
- **OP-17** (major) The nightly job bundles full recompute plus up to 20 vision parses (and now refresh-places) into one serverless invocation, and the admin recompute endpoint is specified as 'async' — both collide with serverless time limits.
  Claim: Twenty vision calls of several seconds each plus trust recompute, DishStat, per-RD recompute, ranking, stale marking and snapshots can exceed the function's maximum duration unless `maxDuration` is exported and the plan permits it; a handler that returns a JobRun id before the work finishes gets frozen on Vercel unless `after()`/`waitUntil` is used, so 'async' as written loses …
  Default: Cron routes export `maxDuration` (300 if the plan allows) and process menus in a capped batch (e.g. 5 oldest per run, each parse bounded by a timeout) with JobRun summaries; the admin recompute runs synchronously under the same maxDuration (or uses Next `after()`), and the admin …
  Where: docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 6 — Phase 5: menu ingestion + review queue; docs/04-RANKING.md § `recomputeAll()` — nightly cron 02:00 PKT (and `pnpm rankings:recompute`); docs/06-API-SPEC.md § Admin (role ADMIN).
- **PL-04** (major) RestaurantDish upserts from menu parse and import have no status precedence: OWNER_VERIFIED downgraded, REMOVED/STALE silently revived.
  Claim: The menu-parse upsert in docs/07 §3 and Prompt 6 unconditionally sets status MENU_VERIFIED and source MENU_PHOTO on an existing row; the 'unless a stronger row already exists' guard appears only in docs/07 §2 for imports and is dropped again in Prompt 3. The state diagram has no OWNER_VERIFIED → MENU_VERIFIED edge and makes REMOVED terminal, so an owner-uploaded or …
  Default: Define a status rank in ranking.constants.ts: CANDIDATE < USER_CONFIRMED < MENU_VERIFIED < OWNER_VERIFIED; any automatic upsert (import, menu parse, user add) only raises status (STALE counts as CANDIDATE for this purpose), always updates …
  Where: docs/07-DATA-PIPELINES.md § 3. Menu ingestion (photo → structured menu); docs/07-DATA-PIPELINES.md § 2. Admin import (`/admin/import`); docs/05-DISH-TAXONOMY.md § Matching pipeline (`src/server/services/matching/`).
- **PL-05** (major) State diagram omits transitions that docs/06/07 allow; flag-removal scope contradicts the diagram.
  Claim: (a) The diagram restricts flag removal to USER_CONFIRMED rows, while docs/07 §6 and Prompt 6 apply 'NOT_SERVED ×3 upheld → REMOVED' to any RD; (b) the owner PATCH accepts OWNER_VERIFIED/REMOVED from any starting status and the admin PATCH any status, yet the diagram lacks CANDIDATE→OWNER_VERIFIED, STALE→OWNER_VERIFIED, CANDIDATE/USER_CONFIRMED/STALE→REMOVED (owner/admin) and …
  Default: Treat the diagram as incomplete and regenerate it from a transition table added to docs/07: owner/admin may set OWNER_VERIFIED or REMOVED from any status except REMOVED; menu parse may create or raise to MENU_VERIFIED; 3 upheld NOT_SERVED flags remove any status except …
  Where: docs/02-ARCHITECTURE.md § RestaurantDish lifecycle; docs/diagrams/restaurant-dish-lifecycle.mmd § stateDiagram-v2; docs/07-DATA-PIPELINES.md § 6. Review queue — payloads and resolutions.
- **PL-09** (major) Flag 'uphold' semantics and the 'NOT_SERVED ×3 upheld' count are ambiguous against the Flag unique constraint and the one-OPEN-item rule.
  Claim: A FLAG review item aggregates 1..n flagIds. The docs do not say whether 'uphold' sets Flag.upheld=true on every flag in the item or lets the admin pick, whether '×3' counts upheld Flag rows accumulated across earlier resolved items for the same RD (the unique constraint already guarantees distinct users) or three separate resolutions, or whether the REMOVED check runs at …
  Default: uphold → set upheld=true on all flagIds in the item; dismiss → upheld=false; after uphold count Flag rows for that RD with reason NOT_SERVED and upheld=true (across all items); at ≥3 set REMOVED, write the audit event, recomputeOne, revalidate. Keep the unique constraint but let …
  Where: docs/03-DATA-MODEL.md § Prisma schema — model Flag; docs/07-DATA-PIPELINES.md § 6. Review queue — payloads and resolutions; docs/06-API-SPEC.md § Authenticated (role USER+) — POST /api/v1/flags.
- **PL-16** (major) Every non-dish or low-confidence menu line becomes a review item: queue flood and an ambiguous '≥ 80% auto-matched' acceptance.
  Claim: The vision prompt extracts every line (naan, roti, raita, salads, water, soft drinks, sauces) and the pipeline creates an UNMATCHED_MENU_ITEM for each line that is not in dishes.json, so each menu yields dozens of 'Ignore' items; at the panel target of ~190+ restaurants with multi-page menus this is thousands of clicks, not a 20-minute weekly session. The 80% criterion does …
  Default: Create ReviewItems only for 0.60–0.85 matches (with suggestions); keep NONE/<0.60 lines on /admin/menu-uploads/[id] in an 'unmatched' group with one-click assign but no queue item; add seed/menu-ignore-words.json (naan, roti, paratha-as-side, raita, salad, water, cold drink, …
  Where: docs/07-DATA-PIPELINES.md § 3. Menu ingestion (photo → structured menu); docs/07-DATA-PIPELINES.md § 3. Menu ingestion (photo → structured menu); docs/05-DISH-TAXONOMY.md § Matching pipeline (`src/server/services/matching/`).
- **PL-17** (major) Re-parse 'deletes previous items of that upload' orphans OPEN review items; REVIEWED detection and FAILED retry are unspecified.
  Claim: ReviewItem references MenuItem only through payload.menuItemId (no FK, no menuUploadId), so deleting items on re-parse leaves OPEN items whose 'assign dish' action targets a missing row; 'all items are resolved' has no defined query (items are found only via payload JSON); the parse endpoint is not said to be allowed from FAILED/PARSED/REVIEWED, and an upload with zero review …
  Default: Include `menuUploadId` in the UNMATCHED_MENU_ITEM payload; on re-parse first set that upload's OPEN items to REJECTED with resolution 'superseded by re-parse', then delete items; allow parse from any status (→ PENDING → PARSED/FAILED); set REVIEWED automatically when no OPEN …
  Where: docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 6 — Phase 5: menu ingestion + review queue; docs/07-DATA-PIPELINES.md § 6. Review queue — payloads and resolutions; docs/03-DATA-MODEL.md § Prisma schema — model ReviewItem.
- **PL-18** (major) Nightly menu parse is bolted into RankingService.recomputeAll, which docs/04 does not list and whose abort-on-throw rule would let an Anthropic failure or spend cap stop ranking recompute.
  Claim: docs/04 defines recomputeAll as steps 1–7 with no parse step; Prompt 6 adds parsing 'to recompute job as a step'; docs/06 has no parse cron. If parsing is a step of recomputeAll, then (a) the admin recompute button and pnpm rankings:recompute also call the vision model (cost, latency), (b) one vision error aborts the whole job per step 7, and (c) hitting the Anthropic spend …
  Default: Keep RankingService.recomputeAll as docs/04 steps 1–7. The cron handler /api/cron/recompute-rankings runs recomputeAll, then MenuService.parsePending(20) as a separate try/catch step that marks individual uploads FAILED and never aborts the job; admin recompute and the CLI call …
  Where: docs/07-DATA-PIPELINES.md § 3. Menu ingestion (photo → structured menu); docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 6 — Phase 5: menu ingestion + review queue; docs/04-RANKING.md § `recomputeAll()` — nightly cron 02:00 PKT.
- **PL-20** (major) No write path for panel/USER menu uploads: MenuUpload creation is owner-only and uploads/sign has no restaurantId for the menus/<restaurantId>/ path.
  Claim: Panel members are role USER (trust-based, not a role). The only MenuUpload-creating route is under 'Owner (role OWNER or ADMIN)' and scoped to the owner's own restaurant; the server-action list has no uploadMenu; and uploads/sign takes only kind, so it cannot issue the restaurant-scoped menus/<restaurantId>/ path or validate it.
  Default: Add `POST /api/v1/restaurant-menus { restaurantId, path }` under Authenticated (USER+, limit `user:{id}:upload`) and server action uploadMenu; uploads/sign accepts `restaurantId` when kind = 'menu' and returns `menus/<restaurantId>/<userId>-<cuid>.<ext>`; keep the owner route as …
  Where: docs/07-DATA-PIPELINES.md § 3. Menu ingestion (photo → structured menu); docs/07-DATA-PIPELINES.md § 3. Menu ingestion (photo → structured menu); docs/06-API-SPEC.md § Owner (role OWNER or ADMIN).
- **ST-14** (major) Parsing up to 20 menu photos inside the nightly recompute function risks Vercel Hobby's 300 s limit.
  Claim: Hobby functions are capped at 300 s and crons are not retried; twenty vision requests on Claude Opus/Sonnet 5.5 (adaptive thinking always on, effort default medium) plus the full recompute will regularly exceed that budget, killing the job mid-run.
  Default: Separate cron `/api/cron/parse-menus` (`30 20 * * *` UTC) with `maxDuration = 300`, a 200 s wall-clock budget, sequential processing, `output_config.effort: "low"`, and per-upload idempotency; keep recompute free of external API calls.
  Where: docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 6 — Phase 5, step 3; docs/07-DATA-PIPELINES.md § 3. Menu ingestion, step 2; docs/04-RANKING.md § recomputeAll() — nightly cron 02:00 PKT.
- **ST-19** (major) @anthropic-ai/sdk 1.0.0 (2026-10-21) defaults to API version 2026-10-21 (temperature/top_p/top_k removed) and current models reject forced tool_choice; build the vision tool and matcher on structured outputs.
  Claim: The SDK's 1.0 line shipped yesterday with one breaking change (API version 2026-10-21), under which `temperature`, `top_p` and `top_k` return 400 on every model; the usual "force the tool to get JSON" pattern (`tool_choice: {type: 'tool'}`) is unsupported on Claude Opus 5.5/Sonnet 5.5; the documented way to get schema-conforming JSON from an image is `output_config.format` …
  Default: Pin `@anthropic-ai/sdk@^1.0.0`. parseMenu: `client.messages.parse({ model, max_tokens: 8192, output_config: { format: zodOutputFormat(MenuSchema), effort: "low" }, system: <docs/07 prompt>, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", …
  Where: docs/07-DATA-PIPELINES.md § 3. Menu ingestion, step 2; docs/05-DISH-TAXONOMY.md § Matching pipeline, step 4; docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 6 — Phase 5, step 1.
- **AP-30** (minor) Flag semantics: flagIds appended in JSON, 'uphold' on an aggregated item vs '×3 upheld flags', unique constraint blocks re-flagging, D7's 'wrong restaurant' has no reason.
  Where: docs/06-API-SPEC.md § ## Authenticated (role USER+); docs/07-DATA-PIPELINES.md § ## 6. Review queue — payloads and resolutions; docs/03-DATA-MODEL.md § ## Prisma schema (authoritative — copy into `prisma/schema.prisma`).
- **PL-24** (minor) Status changes made by flags, owners or admins do not trigger recomputeOne/revalidation, leaving rankInCity and ISR pages stale.
  Where: docs/07-DATA-PIPELINES.md § 6. Review queue — payloads and resolutions; docs/03-DATA-MODEL.md § Invariants (enforce in services + tests); docs/06-API-SPEC.md § Public (no auth) — GET /api/v1/restaurants/:slug.
- **PL-25** (minor) Enum values with no producer or undefined mapping: SourceType PANEL/ADMIN, MatchMethod HUMAN, RestaurantStatus HIDDEN, ReviewItemStatus REJECTED; admin 'assign dish' and owner confirm set no confidence/source.
  Where: docs/03-DATA-MODEL.md § Prisma schema — enums; docs/07-DATA-PIPELINES.md § 6. Review queue — payloads and resolutions; docs/07-DATA-PIPELINES.md § Four sources, in order of trust (table).
- **PL-28** (minor) Two sources of truth for the dish list: seed/dishes.json is the 'master' but admins create dishes in the DB, and the idempotent seed overwrites admin alias edits.
  Where: docs/05-DISH-TAXONOMY.md § 05 — Dish taxonomy and matching (intro); docs/05-DISH-TAXONOMY.md § Rules of the taxonomy; docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 2 — Phase 1: schema, seed, matching.
- **PL-29** (minor) P2 says menu rows appear 'after admin review' but the pipeline auto-creates ranking-eligible MENU_VERIFIED rows at conf ≥ 0.85 without a human.
  Where: docs/01-PRODUCT-SPEC.md § User stories (v1 — all must be met before launch) — Panel; docs/07-DATA-PIPELINES.md § 3. Menu ingestion (photo → structured menu); docs/02-ARCHITECTURE.md § Principles.
- **PL-30** (minor) Several menu lines mapping to one RestaurantDish: menuName, variantTags and price merging unspecified.
  Where: docs/07-DATA-PIPELINES.md § 3. Menu ingestion (photo → structured menu); docs/07-DATA-PIPELINES.md § 3. Menu ingestion (photo → structured menu); docs/03-DATA-MODEL.md § Prisma schema — model RestaurantDish.
- **RK-29** (minor) Admin PATCH on users (bannedAt, trustScore) and on ratings (status) never triggers recomputeOne; banned users' ratings keep counting until the nightly job.
  Where: docs/06-API-SPEC.md § Admin (role ADMIN); docs/07-DATA-PIPELINES.md § 6. Review queue — payloads and resolutions; docs/04-RANKING.md § Trust score (per user).
- **ST-20** (minor) Model-id placeholders: current ids are claude-opus-5-5 / claude-sonnet-5-5 (vision) and claude-haiku-5-5 (cheap matcher); 3.x-era ids are retired.
  Where: docs/10-DEPLOYMENT.md § Environment variables (.env.example); docs/07-DATA-PIPELINES.md § 3. Menu ingestion, Cost; docs/10-DEPLOYMENT.md § Cost estimate (first 6 months).
- **TX-27** (minor) Several menu items mapping to one RestaurantDish: only price merging is specified, not variantTags/menuName.
  Where: docs/07-DATA-PIPELINES.md § 3. Menu ingestion; docs/03-DATA-MODEL.md § Prisma schema — model RestaurantDish; docs/05-DISH-TAXONOMY.md § Rules of the taxonomy, rule 2.

### Phase 6

- **AP-01** (blocker) Owner claim is unreachable: /owner/claim and POST /api/v1/owner/claims sit behind the OWNER role guard, but a claimant is a USER.
  Claim: The claim page (docs/01 route table, docs/02 tree, Prompt 7) and the claims endpoint (docs/06 section header) are placed under the OWNER-only guard that Prompt 1 installs in Phase 0, while docs/07 §4 and Prompt 7 say the claimant is any signed-in USER who only becomes OWNER on admin approval. As written, a USER gets 403 at /owner/claim and at POST /api/v1/owner/claims, so no …
  Default: Move the claim surface out of the guarded group: page `src/app/(app)/claim/page.tsx` and endpoint `POST /api/v1/claims` under 'Authenticated (role USER+)' with limit `user:{id}:claim` 3/day; keep the `owner/` layout guard for OWNER/ADMIN only; update docs/01 route table, docs/02 …
  Where: docs/06-API-SPEC.md § ## Owner (role OWNER or ADMIN); docs/07-DATA-PIPELINES.md § ## 4. Owner claim; docs/02-ARCHITECTURE.md § ## Directory structure.
- **PL-01** (blocker) Owner claim page and endpoint are gated on role OWNER, which no user has before a claim is approved.
  Claim: The claim form lives at /owner/claim under the role-guarded owner/ layout and its API route is listed under 'Owner (role OWNER or ADMIN)', but role OWNER is only granted by the approval of that same claim (docs/07 §4 step 2). A USER therefore gets the Phase 0 403 page when trying to claim, while docs/07 §4 says any signed-in user may submit a claim.
  Default: Move the claim form to src/app/(app)/claim/page.tsx guarded by requireUser() only, and move the route to `POST /api/v1/claims` under 'Authenticated (role USER+)' with rate limit `user:{id}:claim` 3/day. Keep /owner/* (dishes, report, menus) OWNER-only. Update docs/01, 02, 06 and …
  Where: docs/07-DATA-PIPELINES.md § 4. Owner claim; docs/07-DATA-PIPELINES.md § 4. Owner claim; docs/06-API-SPEC.md § Owner (role OWNER or ADMIN).
- **AP-16** (major) Prompt 7's analytics `track()` adds an unscheduled write path and table; `ranking_view` cannot be recorded server-side on ISR pages.
  Claim: Ranking and restaurant pages are served from the ISR cache, so a server-side `track('ranking_view')` fires once per hour per page, not per view; counting views needs a client beacon to a public write endpoint that docs/06 does not define and that CLAUDE.md rule 7 would require to be rate-limited. The `Event` model with `userId` is absent from docs/03 and from the privacy …
  Default: v1: use Vercel Analytics for views; record only server-side events that already pass through services (`rating_submitted`, `search`, `menu_uploaded`) without `userId`; add the `Event` model to docs/03 with 90-day retention stated on the privacy page; defer …
  Where: docs/09-CLAUDE-CODE-PROMPTS.md § ## Prompt 7 — Phase 6: owner area, hardening, launch prep; docs/08-IMPLEMENTATION-PLAN.md § ## Phase 6 — Owner area + hardening + launch (8–10 h); CLAUDE.md § ## Non-negotiable rules.
- **AP-17** (major) Owner REMOVED is a dead end: a rated dish can be buried, new ratings attach to a REMOVED row, and nothing revives or reviews it.
  Claim: An approved owner can set any RD of theirs — including a badly scored one — to REMOVED with no review item or audit. Because `(restaurantId, dishId)` is unique and both user endpoints treat an existing row as 'exists', diners can neither re-add the dish nor get it ranked again: their ratings land on a REMOVED row that never ranks, and the lifecycle defines no exit from …
  Default: Owner 'Remove' creates `ReviewItem FLAG` reason NOT_SERVED with `payload.byOwner = true`; status becomes REMOVED only on admin uphold (until then the RD still ranks). Add `REMOVED --> USER_CONFIRMED: 3 distinct new raters after removal` to the lifecycle so `POST /api/v1/ratings` …
  Where: docs/06-API-SPEC.md § ## Owner (role OWNER or ADMIN); docs/06-API-SPEC.md § ## Authenticated (role USER+); docs/02-ARCHITECTURE.md § ### RestaurantDish lifecycle.
- **OP-08** (major) Migrations run 'before build' in two different places, and `prisma migrate deploy`/`pg_dump` from Vercel or GitHub against Supabase's direct host likely fails because that host is IPv6-only.
  Claim: docs/10 says migrations are a CI/CD step and, two sections later, the Vercel build command; Prompt 1's workflow has no migrate step and no prompt or README step records the Vercel build-command setting. Supabase's direct host (`db.<ref>.supabase.co:5432`) resolves to IPv6 only without the paid IPv4 add-on, while Vercel build containers and GitHub-hosted runners are IPv4-only, …
  Default: DIRECT_URL = the Supavisor session-mode pooler URL (port 5432 on `*.pooler.supabase.com`), documented in .env.example; migrations run only in the Vercel build command (delete the 'CI/CD step' line), and Prompt 1 records `buildCommand` in vercel.json or README; previews use the …
  Where: docs/10-DEPLOYMENT.md § Environment variables (`.env.example`); docs/10-DEPLOYMENT.md § Environments; docs/10-DEPLOYMENT.md § Release steps.
- **OP-09** (major) Launching a product that onboards businesses on Vercel Hobby conflicts with its non-commercial fair-use clause, and docs/11 ops items (log drains, analytics volume) assume Pro features.
  Claim: A public launch with owner claims, a stated sales product and Facebook-group marketing is plausibly 'commercial use' before the first invoice; Log Drains are a Pro feature and Hobby runtime-log retention is short, so the docs/11 ops item is not satisfiable on Hobby while Sentry is marked optional; Hobby Web Analytics has a small monthly event quota that a launch spike exceeds.
  Default: Budget Vercel Pro from launch (Phase 6) — this also lifts the cron cap, enables log drains and raises analytics quota — and make Sentry (free tier, `SENTRY_DSN` in .env.example) non-optional in Phase 6; update the docs/10 cost table ($20 from month ~2).
  Where: docs/10-DEPLOYMENT.md § Accounts to create; docs/08-IMPLEMENTATION-PLAN.md § Research summary that shaped this plan (for context); docs/01-PRODUCT-SPEC.md § Personas.
- **OP-12** (major) Launch criteria need hundreds of panel tastings, but the timeline puts panel onboarding and launch in the same week and panel size differs across docs (8–12 / ≥ 8 / 10).
  Claim: docs/11 launch-day criteria imply ≥ 19 dishes × 5 restaurants × 4 distinct raters = 380 ratings (docs/07's own target is 19 × 10 × 4 = 760), each a physical visit; docs/07 schedules this in 'week 1–2' without saying of what, while the rate flow only exists after Phase 3 (week 3) and is reachable by the panel only if main is deployed to production. The three docs disagree on …
  Default: Deploy to production from Phase 3 onward; onboard the panel at the end of week 3 and run weeks 4–6 as the tasting window in parallel with Phases 4–6; define 'launch' as 'docs/11 launch-day criteria met' rather than week 6 (likely week 7–8); harmonise panel size to '≥ 8 (target …
  Where: docs/08-IMPLEMENTATION-PLAN.md § Timeline (one person, ~10 h/week); docs/08-IMPLEMENTATION-PLAN.md § Phase 6 — Owner area + hardening + launch / Acceptance; docs/07-DATA-PIPELINES.md § 7. Panel operations (non-code, but the plan depends on it).
- **PL-08** (major) Claim approval side effects incomplete: owner's existing ratings, claimedAt/reviewedAt, already-claimed restaurants, rejection reason, duplicate/limit on claims.
  Claim: Approval only blocks future ratings; nothing says what happens to ACTIVE ratings the new owner already made on that restaurant's dishes (they keep counting, possibly at panel trust 1.3). Approval does not mention Restaurant.claimedAt, OwnerClaim.reviewedAt or the ReviewItem resolution; a restaurant already claimed by someone else is silently reassigned (single claimedByUserId, …
  Default: On approve: set claimedAt and reviewedAt, resolve the ReviewItem, set that user's ratings on the restaurant's RDs to HIDDEN with resolution 'owner self-rating' and recomputeOne each; refuse approve when claimedByUserId is another user (admin must unclaim first). Add …
  Where: docs/07-DATA-PIPELINES.md § 4. Owner claim; docs/03-DATA-MODEL.md § Prisma schema — model Restaurant; docs/03-DATA-MODEL.md § Prisma schema — model OwnerClaim.
- **RK-15** (major) Owner self-rating block only stops future writes; ratings the owner made before the claim was approved stay ACTIVE and counted.
  Claim: An owner can rate every dish 10 before submitting the claim (nothing prevents it), get approved, and keep those ratings in W and R indefinitely; neither the claim-approval flow nor the recomputeOne SQL excludes ratings whose userId equals the restaurant's claimedByUserId.
  Default: On claim approval, set the claimant's ACTIVE ratings on that restaurant's RDs to HIDDEN (RatingHistory note 'owner claim approved') and run recomputeOne for each; also add `AND u.id IS DISTINCT FROM r."claimedByUserId"` to the compute query as belt-and-braces. Unit test it with …
  Where: docs/04-RANKING.md § Abuse controls (in RatingService, before compute); docs/07-DATA-PIPELINES.md § 4. Owner claim; docs/03-DATA-MODEL.md § Invariants (enforce in services + tests).
- **ST-12** (major) Vercel fair use treats advertising a paid product as commercial; the launch copy advertises paid badges while docs/10 stays on Hobby until first revenue.
  Claim: Vercel's fair-use guidelines define commercial usage as any deployment used for the financial gain of anyone involved, listing "Advertising the sale of a product or service" as an example; a public launch whose trust page and owner area advertise paid badges/reports falls under that definition before the first invoice.
  Default: Budget Vercel Pro ($20/mo) from the public launch in Phase 6 and update the docs/10 cost table; until launch keep Hobby but remove "buy a badge"/paid-report wording from public copy (keep the data model).
  Where: docs/10-DEPLOYMENT.md § Accounts to create; docs/10-DEPLOYMENT.md § Cost estimate (first 6 months); docs/01-PRODUCT-SPEC.md § Trust rules shown to users.
- **AP-23** (minor) Owner endpoints: 'only for own restaurant' stated for one of four; ADMIN-on-owner semantics and requireRole hierarchy undefined.
  Where: docs/06-API-SPEC.md § ## Owner (role OWNER or ADMIN); docs/02-ARCHITECTURE.md § ## Cross-cutting; docs/03-DATA-MODEL.md § ## Prisma schema (authoritative — copy into `prisma/schema.prisma`).
- **AP-24** (minor) Ratings an owner made before their claim is approved stay ACTIVE; invariant 4 only blocks new writes.
  Where: docs/03-DATA-MODEL.md § ## Invariants (enforce in services + tests); docs/07-DATA-PIPELINES.md § ## 4. Owner claim; docs/04-RANKING.md § ## Abuse controls (in RatingService, before compute).
- **AP-35** (minor) Google OAuth on Vercel preview deployments: redirect URIs must be exact, so sign-in on per-PR preview URLs cannot work as documented.
  Where: docs/10-DEPLOYMENT.md § ## Environments; docs/10-DEPLOYMENT.md § ## Accounts to create (all free tiers to start); docs/02-ARCHITECTURE.md § ## Deployment.
- **OP-25** (minor) docs/11 items with no producing phase: backup Action and restore drill, user-deletion process for the privacy page, accessibility pass, footer dispute link, Lighthouse on the restaurant page, search rate limiting before rate-limit.ts exists.
  Where: docs/11-REVIEW-CHECKLIST.md § Ops; docs/10-DEPLOYMENT.md § Backups and safety; docs/11-REVIEW-CHECKLIST.md § Data policy.
- **OP-29** (minor) The 'authoritative' docs/03 schema lacks the Event model Prompt 7 adds; the prompt does not say to migrate or update docs/03.
  Where: docs/03-DATA-MODEL.md § Prisma schema (authoritative — copy into `prisma/schema.prisma`); docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 7 — Phase 6: owner area, hardening, launch prep; docs/08-IMPLEMENTATION-PLAN.md § Phase 6 — Owner area + hardening + launch.
- **OP-32** (minor) Release process ambiguity: docs/10 gates production on PR → CI → merge while docs/08/09 commit each phase straight to main (auto-deployed by Vercel), with no branch protection and no pre-launch noindex.
  Where: docs/10-DEPLOYMENT.md § Release steps; docs/08-IMPLEMENTATION-PLAN.md § (intro); docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 1 — Phase 0: scaffold.
- **OP-34** (minor) Diagrams place the app in Vercel region bom1 but docs/10 has no step to set the function region; the default region would put every dynamic request a continent away from the Mumbai database.
  Where: docs/02-ARCHITECTURE.md § Containers; docs/diagrams/containers.mmd § (root); docs/10-DEPLOYMENT.md § Accounts to create.
- **PL-26** (minor) Sources table says owners create RestaurantDish rows, but no owner endpoint or UI creates one.
  Where: docs/07-DATA-PIPELINES.md § Four sources, in order of trust (table); docs/06-API-SPEC.md § Owner (role OWNER or ADMIN); docs/01-PRODUCT-SPEC.md § User stories (v1 — all must be met before launch) — Owner.
- **PL-33** (minor) Weekly RankingSnapshot plus re-runnable recompute makes the owner report's '7-day change vs last snapshot' undefined; dishes outside the top 50 have no trend.
  Where: docs/04-RANKING.md § `recomputeAll()` — nightly cron 02:00 PKT; docs/06-API-SPEC.md § Owner (role OWNER or ADMIN); docs/09-CLAUDE-CODE-PROMPTS.md § Prompt 7 — Phase 6: owner area, hardening, launch prep.
- **ST-25** (minor) docs/02 says Vercel region bom1 but docs/10 vercel.json sets no `regions`; functions default to iad1 (Hobby allows one region).
  Where: docs/02-ARCHITECTURE.md § Containers; docs/10-DEPLOYMENT.md § Crons (vercel.json); docs/02-ARCHITECTURE.md § Deployment.

### Phase 7

- **TX-16** (major) Preparation styles are inconsistently dishes vs tags: Sindhi Biryani is a dish while Bombay Biryani is an alias.
  Claim: Sindhi (style) is its own dish but Bombay (style) is folded into chicken-biryani; Bannu pulao (a dish people compare separately) is folded into beef-pulao; Chicken Reshmi Kabab and Chicken Malai Boti are dishes while 'reshmi handi' is an alias of chicken-handi. The seed does not follow rule 2 consistently and the docs give no criterion for which styles become dishes.
  Default: Apply rule 5 as the tie-breaker: a style becomes a dish only if 'best <style> X' is a common ask (keep Sindhi Biryani, add Bannu Pulao as a dish, make 'bombay' a tag), and record the criterion in docs/05.
  Where: docs/05-DISH-TAXONOMY.md § Rules of the taxonomy, rule 2; seed/dishes.json § sindhi-biryani / chicken-biryani; seed/dishes.json § beef-pulao / chicken-handi.

## Drop

- **AP-02** First-admin bootstrap: 'seed sets role ADMIN for ADMIN_EMAIL' cannot run before the User row exists, and pre-creating the row breaks Google sign-in. Resolved: Better Auth user-create hook.
- **AP-03** Auth.js v5 is still an npm `beta` dist-tag; the kit's env-var names and `auth()` API are v5-only but no prompt says to install the beta. Resolved: Better Auth.
- **AP-13** Storage contract conflicts: 'signed URLs expire ≤ 10 min' vs Supabase signed upload URLs (fixed 2 h), private bucket vs 1-hour ISR pages, one bucket for menus and photos. Resolved: public dish-photos bucket, private menus bucket, reworded checklist.
- **OP-02** Phase 1 acceptance example and docs/05 test table cannot pass with seed/variant-tags.json as written (meat words, 'tikka' and 'namkeen' are variant tags). Resolved: matching decisions.
- **OP-03** 'Prisma 5+' with a Prisma-5/6-style schema while the registry `latest` is an 8.0 release candidate and Prisma 7 changed generator, config and seed setup. Resolved: Prisma 7 pin.
- **OP-04** Auth.js v5 is still a beta dist-tag; installing `next-auth` without `@beta` yields v4 with a different API and env-var names than docs/10 assumes. Resolved: Better Auth.
- **OP-06** The 'fixed' stack names stale majors (Next.js 15, tailwind.config.ts, shadcn `toast`) while today's `latest` for TypeScript, zod, ESLint and the Anthropic SDK changed APIs; Prompt 0 asks for majors with no pinned baseline. Resolved: approved package set.
- **OP-10** Prompt 2 seeds City.launchedAt = now() in week 1, so the 60-day bootstrap window is mostly consumed before the week-6 launch and resets on every seed run. Resolved: launchedAt stays empty until launch day.
- **OP-11** First-admin bootstrap is contradictory (docs/10 says the seed sets ADMIN by ADMIN_EMAIL; Prompt 1 says edit the DB by hand; Prompt 2's seed never does it) and the seed approach breaks Google sign-in. Resolved: Better Auth user-create hook.
- **OP-14** CI as defined (lint, typecheck, unit tests, no database) cannot run the DB-backed tests Prompts 2, 4 and 6 require to pass, and no local DB path works without Docker. Resolved: CI postgres service container.
- **OP-15** Ranking/restaurant page design conflicts with ISR: URL search-param filters, 'signed-in' conditional buttons and server-side view events force dynamic rendering, violating CLAUDE.md rule 8 / ADR-8. Resolved: filters run in the browser.
- **OP-20** Photo storage and display are unspecified and self-contradictory: private bucket with short signed URLs vs 1-hour ISR pages and `next/image`; signed-upload TTL requirement; possibly missing public Supabase env vars. Resolved: public dish-photos bucket, private menus bucket.
- **OP-21** Local/preview environment plan is not executable as written: Docker is absent (no `supabase start`), 'Neon branch' is outside the fixed stack, three cloud projects exceed the Supabase free allowance, the preview project will pause, `migrate dev` may need a shadow DB, and preview URLs break Google OAuth redirects. Resolved: no Docker; Homebrew PostgreSQL.
- **OP-22** Claude Code is never pointed at docs/10: Prompt 0 reads docs/01–08 only, CLAUDE.md's read order stops at 08, Prompt 1 cites docs/06 for 'three crons … times in UTC' though docs/06 gives one schedule, and no later prompt says to extend .env.example. Resolved: Prompt 1 now cites docs/10.
- **OP-23** Several CLAUDE.md commands are never assigned to a prompt or differ in flags (menu:parse --upload, rankings:recompute, typecheck, db:*), and the dev-fake-ratings script has no command. Resolved: approved scripts list.
- **OP-26** Kit README says 'Drop it into an empty repo' but its own §1 and docs/09 copy only CLAUDE.md, docs/ and seed/; Prompt 1 then (re)writes README.md, so the kit's usage guide is lost if the whole folder is dropped in. Resolved: kit at the repo root; Prompt 1 keeps the README sections.
- **OP-33** Prompts add scope the docs/08 phase lists omit (refresh-places cron, OG image route, /admin/rankings, mark-stale cron, dev-fake-ratings, /admin dashboard, Event table, LAUNCH-REPORT.md) so the hour estimates and the week-1 load are understated. Dropped: bookkeeping; the prompts define scope.
- **PL-13** Panel seeding plan collides with burst detection (accounts < 7 days) and the 3 ratings/user/restaurant/day limit. Resolved: panel exempt from the burst rule; 10 per restaurant per day.
- **PL-14** Nightly trust recompute overwrites admin-set panel trust; no override/panel field in User. Resolved: isPanel keeps trust at 1.3.
- **PL-15** Seed sets City.launchedAt = now() in Phase 1 and on every re-seed, so the 60-day bootstrap window burns before launch and resets non-deterministically. Resolved: launchedAt stays empty until launch day.
- **RK-01** Nightly trust recompute has no field to preserve admin-set panel trust (1.3) or the extreme-score hold, so panel reverts to 0.6 and bootstrap eligibility (4 × 0.6 = 2.4 < 2.5) collapses. Resolved: isPanel keeps trust at 1.3.
- **RK-06** Burst rule classifies freshly onboarded panel members (and any group signing up at the table) as 'accounts younger than 7 days', holding the ratings the launch plan depends on. Resolved: panel exempt from the burst rule.
- **RK-09** Seed sets City.launchedAt = now() in week 1, so the 60-day bootstrap window starts five weeks before launch and resets on every re-seed; NULL semantics undefined. Resolved: launchedAt stays empty until launch day.
- **RK-12** 'rank' is a nightly rankInCity in some places and a live list position in others; rank under an area filter or sort=votes is undefined. Resolved: ranks are always city-wide.
- **RK-18** Per-restaurant cap (3 ratings/user/restaurant/day) blocks a panel visit that tastes 4+ launch dishes at one restaurant. Resolved: panel may rate 10 dishes per restaurant per day.
- **RK-26** docs/02 names tables restaurant_dishes, rate_limit_buckets, job_runs; the Prisma schema has no @@map so the tables are "RestaurantDish", "RateLimitBucket", "JobRun". Dropped: naming only; the docs/03 schema is authoritative.
- **ST-02** Reading searchParams opts the ranking page into dynamic rendering, so `export const revalidate = 3600` and ISR do not apply (violates CLAUDE.md rule 8 / ADR-8). Resolved: filters run in the browser.
- **ST-04** docs/03 User model lacks `emailVerified`; Auth.js creates every OAuth user with `emailVerified: null`, so the first Google sign-in fails. Resolved: version and auth decisions.
- **ST-05** next-auth v5 is still a beta (5.0.0-beta.32), the project is in maintenance under Better Auth, and betas <= .31 have a critical fail-open CVE. Resolved: version and auth decisions.
- **ST-06** `prisma@latest` is the 8.0.0 release candidate; "Prisma 5+" unpinned installs a CLI/client major mismatch and a schema dialect that rejects docs/03. Resolved: version and auth decisions.
- **ST-07** Prisma 7 moved datasource URLs, seeding and env loading into prisma.config.ts and requires a driver adapter; docs/03 datasource block and Prompt 1/2 instructions are the Prisma 5/6 shape. Resolved: version and auth decisions.
- **ST-08** Supabase Free direct connections are IPv6-only and Vercel/GitHub Actions are IPv4-only, so `prisma migrate deploy` in the Vercel build cannot use a `db.<ref>.supabase.co` DIRECT_URL. Resolved: version and auth decisions.
- **ST-09** `connection_limit=1` in DATABASE_URL is a Prisma-engine parameter that the pg driver adapter ignores; pool size/timeouts now come from pg. Resolved: version and auth decisions.
- **ST-10** Supabase signed upload URLs are valid for a fixed 2 hours; docs/11 requires signed URLs to expire in <= 10 min. Resolved: checklist reworded for 2 h signed upload URLs.
- **ST-11** Supabase Free allows 2 active projects; docs/10 implies three cloud projects and the laptop lacks Docker/Supabase CLI for `supabase start`. Resolved: Homebrew PostgreSQL locally; preview + production projects.
- **ST-16** Places terms allow storing only place IDs (indefinitely) and lat/lng (30 days); the seed CSV kept displayName/formattedAddress and the Create form was prefilled from them. Resolved 2026-10-25 by the owner's decision (docs/OPEN-QUESTIONS.md, Decided; Maps Platform Terms 3.2.3(a)(iii), 3.2.3(b), 3.2.3(c)(iv)): live search with Google data shown, never saved; empty Create form; no CSV; only place id, lat/lng and fetch time saved on Create or Link.
- **ST-17** No Node version is pinned; Node 20 is EOL and deprecated on Vercel, vitest 5/supabase-js/Prisma 8 need >= 22, and the laptop runs 20.19.4 with a broken pnpm. Resolved: version and auth decisions.
- **ST-18** TypeScript `latest` is 7.0.2 with no JavaScript API; typescript-eslint supports < 6.1, so pin TypeScript 6.0.x (ESLint 10 is fine with eslint-config-next 16.4 flat config). Resolved: TypeScript 6.0 approved.
- **ST-21** Zod `latest` is 4.6.7; v4 renames error customisation and deprecates several APIs the validation layer and error mapping will touch. Resolved: Zod 4 approved.
- **ST-22** Tailwind v4 and shadcn CLI 4 do not generate tailwind.config.ts; configuration lives in globals.css and components.json. Resolved: Tailwind 4 tree fixed.
- **ST-23** pg_trgm `similarity(searchText, q)` over the concatenated alias text cannot reach the 0.80/0.60 thresholds; the docs/05 TRIGRAM test row is unmeetable and word_similarity/strict_word_similarity with recalibrated thresholds are needed. Resolved: DishAlias matching.
- **ST-26** "The daily cron keeps it alive" is not established by Supabase's pausing rules; official criterion is "sufficient user database activity". Dropped: wording; Pro before launch is already planned.
- **TX-01** Meat words are variant tags, so the documented normaliser erases the dish identity before alias matching. Resolved: matching decisions (docs/05).
- **TX-02** "tikka" is a variant tag while Chicken Tikka is a launch dish. Resolved: matching decisions (docs/05).
- **TX-03** "namkeen" is a variant tag while Namkeen Gosht is a launch dish whose every alias contains it. Resolved: matching decisions (docs/05).
- **TX-04** Test row "Mutton Peshawari Namkeen Karahi → review (two aliases hit)" is unreachable under any reading of the pipeline. Resolved: matching decisions (docs/05).
- **TX-05** Trigram step thresholds (0.80 accept, 0.60 candidate) are unreachable with similarity() over the concatenated searchText. Resolved: matching decisions (docs/05).
- **TX-06** Test row "Chicken Fajita Pizza Large → pizza [fajita] ALIAS 1.0" fails under the only consistent normaliser reading. Resolved: matching decisions (docs/05).
- **TX-07** Test row "Dahi Bhaly Chaat → dahi-bhallay" cannot be produced; the longest-alias rule picks chaat. Resolved: matching decisions (docs/05).
- **TX-08** "Karahi alone" can never reach the review queue with suggestions: meat-word safety sets 0.5, which step 5 files as 'without suggestion'. Resolved: matching decisions (docs/05).
- **TX-09** Single/Double/Family are 'stripped and dropped' size words in rule 3 but stored tags in variant-tags.json and the test table. Resolved: matching decisions (docs/05).
- **TX-10** Alias matching is 'exact' in step 2 but the longest-alias rule, two test rows and dead aliases presuppose substring matching and normalised keys. Resolved: matching decisions (docs/05).
- **TX-11** Price-token rule removes only digits followed by '/-', so 'Rs 2400' leaves '2400' in the text. Resolved: matching decisions (docs/05).
- **TX-12** Tag words 'hot', 'dry', 'egg', 'white', 'cheese' make three whole dishes and several aliases unreachable. Resolved: matching decisions (docs/05).
- **TX-13** Aliases that resolve to a different dish after normalisation, including the 'desi murgh' phrase that deletes the meat word. Resolved: matching decisions (docs/05).
- **TX-18** Rule-5 doubtful entries and category misplacements in the seed. Dropped: product choice; keep these dishes.
- **TX-19** Dish count is quoted as ~70, ~80 and 'the number in the file' while the seed has 84. Dropped: cosmetic count wording.
- **TX-20** docs/01 says areas are a 'shared areas list' but the model and seed bind each area to one city. Dropped: cosmetic wording.
- **TX-21** Rawalpindi area name in docs/01 does not match the seed. Dropped: cosmetic; the seed name is authoritative.
- **TX-22** 'Name is an implicit alias' is undefined for names with punctuation and two names are absent from their alias lists. Resolved: matching decisions (docs/05).
- **TX-23** Trigram query returns LIMIT 3 but the LLM prompt wants the top 10 candidates. Resolved: matching decisions (docs/05).
- **TX-24** TRIGRAM accept threshold (0.80) is below the auto-create threshold (0.85), so a 'conclusive' match still lands in review and skips the LLM. Resolved: matching decisions (docs/05).
- **TX-28** Trigram index list differs between docs/02 and docs/03. Dropped: cosmetic; docs/03 SQL is authoritative.
