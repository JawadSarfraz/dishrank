# 09 — Claude Code prompts (paste in order)

How to use
1. The repo root `dishrank/` already holds `CLAUDE.md`, `docs/`, `seed/` and `.nvmrc`. Run `git init` and commit them.
2. Open the folder in VS Code, start Claude Code, paste **Prompt 0**. Answer its questions. Commit.
3. Paste one phase prompt at a time. After each: run the app, click through the acceptance criteria, commit. If something is off, use the **Fix prompt** at the end, not a new feature prompt.
4. Before launch paste the **Audit prompt**.

Tips
- Keep each prompt in its own Claude Code session or `/clear` between phases so context stays focused on `CLAUDE.md` + the docs it reads.
- If Claude Code asks a product question, answer in one line and also add it to `docs/OPEN-QUESTIONS.md` so the decision is recorded.
- Say "stop and show me the plan first" if a phase feels too big; approve, then "go".

---

## Prompt 0 — Kickoff (read, plan, ask)

```
You are the lead engineer on DishRank. Read CLAUDE.md fully, then docs/01 through docs/08 in order, and skim seed/*.json. Do not write code yet.

Then:
1. Write a 15-line summary of the product and architecture back to me in your own words, so I can confirm you understood.
2. List any contradictions or gaps you found between the docs (be specific: file + section).
3. Ask me at most 5 questions whose answers change what you would build in Phases 0–4. Do not ask about things the docs already decide.
4. Propose the exact package.json scripts and the pnpm dependencies (with major versions) you intend to use for Phase 0, and wait for my OK.

Rules: follow CLAUDE.md; put every unresolved question into docs/OPEN-QUESTIONS.md with a proposed default.
```

---

## Prompt 1 — Phase 0: scaffold

```
Implement Phase 0 from docs/08-IMPLEMENTATION-PLAN.md.

Scope:
- Node.js 24 LTS: keep the existing .nvmrc (24); package.json "engines": { "node": "24.x" } and "packageManager": "pnpm@12.14.0".
- Packages approved on 2026-10-22 (caret ranges unless noted): next ^16.4.2, react and react-dom ^19.3.1, better-auth ^1.7.12, @prisma/client and @prisma/adapter-pg ^7.10.1, zod ^4.6.7, class-variance-authority ^0.7.1, clsx ^2.1.1, tailwind-merge ^3.7.0, lucide-react ^1.61.0. Dev: prisma ^7.10.1, dotenv ^18.0.8, tsx ^4.23.15, typescript ~6.0.3 (not 7.0: typescript-eslint supports < 6.1), @types/node ^24.19.2, @types/react and @types/react-dom ^19.3.0, tailwindcss and @tailwindcss/postcss ^4.3.3, tw-animate-css ^1.4.0, eslint ^10.13.0 (flat config), eslint-config-next ^16.4.2, eslint-config-prettier ^10.1.8, prettier ^3.9.10, vitest ^5.0.5, @playwright/test ^1.64.1. Scripts: the CLAUDE.md commands plus start, format and postinstall (prisma generate); lint = "eslint ." because Next.js 16 removed next lint.
- The repo root already holds the kit, so run create-next-app in a temporary folder and merge its files; never overwrite CLAUDE.md, docs/ or seed/.
- Next.js 16 (stable) App Router, TypeScript strict, pnpm, Tailwind, shadcn/ui (init with button, input, card, dialog, badge, table, tabs, toast), ESLint + Prettier, Vitest (with a passing sample test), Playwright (one smoke test that loads /).
- Prisma ORM 7, latest stable 7.x (prisma, @prisma/client, @prisma/adapter-pg all ^7; npm `latest` for prisma is the 8.0 RC, so never install unpinned). Generator and datasource exactly as docs/03. prisma.config.ts at the root: `import "dotenv/config"` (Prisma 7 does not load .env itself), schema path, migrations path + seed command, datasource.url = env("DIRECT_URL"). src/server/db.ts: PrismaClient singleton from src/generated/prisma built with `new PrismaPg({ connectionString: process.env.DATABASE_URL })`. DATABASE_URL (pooled) and DIRECT_URL (migrations) in .env.example with comments as in docs/10.
- Better Auth (better-auth ^1.7) with Google sign-in (socialProviders.google), `prismaAdapter(prisma, { provider: "postgresql" })`, database sessions with the cookie cache off, `advanced.database.generateId = false` (ids come from the Prisma defaults), `user.additionalFields.role = { type: "string", input: false, defaultValue: "USER" }`, and the `nextCookies()` plugin. Route handler src/app/api/auth/[...all]/route.ts = `toNextJsHandler(auth)`. A `databaseHooks.user.create.before` hook gives ADMIN_EMAIL role ADMIN on first sign-in. Auth models in prisma/schema.prisma (User with role enum, Session, Account, Verification) exactly as in docs/03 (only the auth part for now; the rest comes in Phase 1).
- src/server/auth.ts exporting auth (the Better Auth instance), requireUser(), requireRole(role). requireUser() reads `auth.api.getSession({ headers: await headers() })` and throws AppError UNAUTHENTICATED (401) without a session; requireRole() throws FORBIDDEN (403) unless the session user's role is allowed. requirePageRole(role) for layouts and pages: signed-out → redirect('/sign-in?callbackUrl=<path>'); wrong role → returns null and the page or layout renders the Forbidden component (HTTP 200, noindex) without fetching data. src/app/admin/layout.tsx, src/app/owner/layout.tsx and every page under them call requirePageRole; admin/owner services take the current user as their first argument and call requireRole themselves. Do not use next/navigation forbidden() (still experimental). A minimal /sign-in page with the Google button.
- src/env.ts: Zod schema for every server env var (DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET ≥ 32 chars, BETTER_AUTH_URL, GOOGLE_CLIENT_ID/SECRET, CRON_SECRET, …; optional ones marked optional); src/instrumentation.ts imports it in register() so a production start with a missing or malformed required variable throws; in development it logs the problems. Server code reads env, not process.env.
- Directory structure exactly as docs/02 §Directory structure (create empty index files where needed with a one-line comment).
- vercel.json with the two scheduled crons from docs/10 (recompute-rankings and refresh-places, daily, times in UTC). Stubs for /api/cron/recompute-rankings, /api/cron/refresh-places and /api/cron/mark-stale (manual only) share a requireCronSecret() guard: 500 CRON_SECRET_MISSING when CRON_SECRET is unset or empty, 401 on mismatch, crypto.timingSafeEqual on equal-length buffers; then return { ok: true, stub: true }.
- README.md: add a local setup section (Homebrew PostgreSQL with the same major version as the Supabase projects, plus pg_trgm and unaccent; the preview Supabase project for storage; Google OAuth credentials; env vars) and the commands from CLAUDE.md. Keep the existing kit sections.
- GitHub Actions workflow on pull_request and push to main: Node from .nvmrc, pnpm install, a postgres service container (same major version as the Supabase projects; the image ships pg_trgm and unaccent), prisma migrate deploy, lint, typecheck, test.
- Minimal home page with the product name and a "Sign in with Google" button; signed-in users see their email and a sign-out button.

Acceptance (verify and report each):
- pnpm lint, pnpm typecheck, pnpm test, pnpm build all pass.
- Signed out, /admin redirects to /sign-in with a callbackUrl. Signed in as USER, /admin and every admin page show the Forbidden page and fetch no admin data; an admin service called with a USER actor throws FORBIDDEN. After I set my role to ADMIN in the DB, /admin renders.
- Each cron stub answers 500 when CRON_SECRET is unset and 401 with a wrong or empty token; the right token returns { ok: true, stub: true }.
- `pnpm build && pnpm start` with a required env var removed fails at startup with a message naming the variable.
- .env.example documents every env var used anywhere in the code.

Commit as: chore: scaffold next app, auth, prisma, ci
Finish with a short "how to verify" list.
```

---

## Prompt 2 — Phase 1: schema, seed, matching

```
Implement Phase 1 from docs/08.

1. Replace prisma/schema.prisma with the full schema in docs/03-DATA-MODEL.md (keep the Auth models). Create the migration. Add a second migration with the raw SQL from docs/03 (pg_trgm, unaccent, GIN indexes on "Restaurant"."searchText" and "DishAlias"."alias").
2. prisma/seed.ts: load seed/cities.json, seed/areas.json, seed/dish-categories.json, seed/dishes.json. Idempotent upserts by slug. Upsert one DishAlias row for normalize(name) and for every alias, using normalize() from the matching module; the seed fails if an alias is not already normalised or belongs to two dishes. Leave City.launchedAt NULL; the seed never sets or resets it (an admin sets it on launch day, Phase 4).
3. src/server/services/matching/: normalize.ts (size words from seed/variant-tags.json, loaded at build time), aliases.ts (DishAlias map built from DB at call time, cached 10 min; longest contained alias and the meat-word retry), tags.ts (leftover-word classification with seed/variant-tags.json tags and seed/meat-words.json), trigram.ts (Prisma $queryRaw on DishAlias with similarity() and the 0.45 threshold), llm.ts (Anthropic SDK structured output; model from env ANTHROPIC_MATCH_MODEL; returns { dishSlug|null, confidence, reason }; skip gracefully if ANTHROPIC_API_KEY is missing), index.ts exposing matchDish(rawName, { section?, allowLlm }) → { dishId|null, confidence, method, variantTags, candidates[] }. Implement steps 1-6, the meat-word safety rule and the thresholds exactly as docs/05.
4. src/lib/slug.ts (slugify with transliteration of common Urdu romanizations is NOT needed; ascii only), src/lib/geo.ts (haversineKm).
5. Unit tests: every row of the test table in docs/05 (mock the trigram and LLM steps where they are not needed), the docs/05 seed tests, slug and geo tests, seed loads without duplicates.
6. Zod schemas in src/server/validation/ for everything listed in docs/06 (they will be used in later phases).

Acceptance:
- pnpm db:migrate && pnpm db:seed on a fresh DB → counts: 2 cities, 30 areas, 12 categories, the number of dishes in seed/dishes.json, and one DishAlias row per distinct normalised name or alias (478 with today's seed).
- pnpm test passes including all matching cases.
- Document any alias you had to add to make a test pass by editing seed/dishes.json (do not special-case in code).

Commit as: feat(data): schema, seed and dish matching
```

---

## Prompt 3 — Phase 2: Google Places seeding + admin import + restaurants

> Superseded on 2026-10-25 (docs/02 ADR-13): Google Places was dropped completely, and Phase 2 now stages Overture Maps candidates for admin review (docs/07 §1–2, docs/08 Phase 2). Kept for history; do not run it again.

```
Implement Phase 2 from docs/08 following docs/07 §1 and §2 and CLAUDE.md rules 1–2 (no scraping; persist only googlePlaceId + lat/lng + fetch time from Google, and only on an admin Create or Link; Google names and addresses are shown, never saved, logged, cached or prefilled). Revised 2026-10-25: live search replaces the CSV import.

1. src/server/places/textSearch.ts and placeDetails.ts using fetch (cache: "no-store") against Places API (New) with request bodies and X-Goog-FieldMask exactly as docs/07 §1 and §5 (locationRestriction rectangle around the area; the Text Search masks include nextPageToken; Place Details mask is `location`). NOT_FOUND from Place Details is a distinct result, not a thrown error. Errors keep only status codes outside the CLI. Env GOOGLE_PLACES_API_KEY. Retry 429/5xx with backoff. Unit-test the request builder (no network).
2. scripts/seed-places.ts (run with tsx): planning tool only. Args --city --dish [--areas] [--dry-run] [--max-calls=150]; ids-only field mask (free); prints per-area counts, unique places, calls used and the live-import estimate; writes no file and never writes the DB.
3. src/server/services/restaurant.service.ts + repositories: create, update, setStatus, merge(sourceId, targetId) exactly as docs/07 §2 "Merging duplicate restaurants" (one transaction, mergedIntoId, googlePlaceId moved after clearing the source, recompute after commit), search(city, q) via trigram + ILIKE fallback, slug generation with area suffix and uniqueness.
4. /admin/import: pick dish + area → live Text Search page (name, address, "Open in Google Maps" link from the place id; display only) with "Load more" → dedupe (by googlePlaceId, then trigram ≥ 0.6 on name within the searched area) → per-result Create (empty form: the admin types the name as on the signboard or the restaurant's own page and a short address in their own words; area defaults to the searched area) / Link / Skip → sets googleSyncedAt = the search response time (never the import time) → creates RestaurantDish CANDIDATE source GOOGLE_SEARCH confidence 0.4. Show the official Google Maps logo on this admin page only.
5. /admin/restaurants: paginated list with search, edit form, status change, merge dialog. A merged restaurant's page /[city]/r/[slug] redirects permanently to the surviving restaurant (permanentRedirect, HTTP 308; the JSON endpoint answers 301).
6. GET /api/v1/restaurants/search and GET /api/v1/restaurants/:slug (dishes list will be empty-ish for now).
7. /api/cron/refresh-places (daily): exactly as docs/07 §5 "Places coordinate refresh": catch-up nulling past 29 days, rows with googleSyncedAt NULL or older than 25 days, NOT_FOUND or a failure at 28+ days → lat/lng NULL + PLACE_REFRESH_FAILED review item, 250 s time budget, JobRun.summary with call counts.

Acceptance:
- pnpm seed:places -- --city=islamabad --dish=chicken-karahi --dry-run prints the plan; a real run prints per-area counts and call estimates and writes no file.
- Importing from the live search creates restaurants with areas; duplicates are flagged; search "but karahi" finds "Butt Karahi".
- No Google name, address or error text reaches the DB, a file or a log (tests/unit/import/google-data-guard.test.ts); no Google response is cached.
- Imported restaurants have googleSyncedAt equal to the search response time; Google data older than 30 days cannot be saved.
- Merging two restaurants that share a dish and a rater succeeds, keeps one rating per user (the older one in RatingHistory), and the old restaurant URL redirects to the survivor.
- refresh-places with a stubbed NOT_FOUND nulls lat/lng and opens one PLACE_REFRESH_FAILED review item.

Commit as: feat(restaurants): places seeding, admin import, restaurant admin
```

---

## Prompt 4 — Phase 3: rating flow

```
Implement Phase 3 from docs/08 using docs/04 (abuse rules, recomputeOne) and docs/06 (POST /api/v1/ratings, restaurant-dishes, uploads/sign, rate limits).

1. src/server/rate-limit.ts: DB sliding window on RateLimitBucket (1-hour buckets, sum last N buckets). Helper assertRateLimit(key, limit, windowSeconds).
2. src/server/services/rating.service.ts: createOrReplace(userId, input) implementing: restaurant ACTIVE check, owner-self-rating block (panel users included), rate limits (panel: 30/day, 10 per restaurant per day), RD get-or-create (CANDIDATE/USER/0.5), upsert Rating + RatingHistory, comment screening (phone/URL regex → status HELD + ReviewItem), burst detection (≥5 ratings in 24h from non-panel accounts < 7 days → HELD + ReviewItem SUSPICIOUS_RATINGS), then RankingService.recomputeOne. deleteOwn(userId, ratingId).
3. src/server/services/ranking.service.ts: constants file; weight(), bayes(), eligibility(cityLaunchedAt), recomputeOne(rdId) with the SQL from docs/04; promotion CANDIDATE → USER_CONFIRMED at 3 distinct raters. (recomputeAll comes in Phase 4.)
4. Storage: POST /api/v1/uploads/sign using Supabase service key to create a signed upload URL in the public dish-photos bucket at dish-photos/<userId>/<cuid>.<ext> (random cuid name); validate content type (image/jpeg, image/webp) and size; client-side resize to ≤1600px re-encoded through canvas (no heavy libs), which strips EXIF/GPS. Menu photos use the private menus bucket.
5. /rate page (mobile-first): step 1 restaurant search (debounced, trigram endpoint, shows area) → step 2 dish picker (launch dishes as chips, search box with trigram, "Add a dish this restaurant serves" that only lists canonical dishes; "Can't find it? Propose a dish" → DISH_PROPOSAL) → step 3 score 1–10 big tap targets, optional taste/portion/value 1–5, optional photo and comment → submit via server action submitRating → success screen with current score/rank or "needs N more votes".
6. Server actions: submitRating, deleteRating, addRestaurantDish, proposeDish — thin wrappers around services with Zod and revalidatePath for /[city]/best-[dish] and /[city]/r/[slug] (those pages come next phase; revalidate by path string now).
7. Route handlers for the same operations under /api/v1 (ratings, restaurant-dishes, proposals, uploads/sign, me/ratings).
8. /me page: my ratings (restaurant, dish, score, date), edit (re-opens /rate prefilled), delete.
9. Unit tests: ranking math (weight half-life, bayes pull), eligibility incl. bootstrap, abuse rules (owner block incl. panel, burst hold, panel exemption, rate limits incl. panel limits), recomputeOne promotion.
10. /admin/users (admin only): search by email, toggle isPanel through PATCH /api/v1/admin/users/:id; the panel flag is never accepted from any non-admin input.

Acceptance:
- On a 375px viewport, rating a dish for an existing restaurant takes 4 taps after search and finishes in < 30 s.
- Second rating by the same user on the same dish replaces the first and adds a RatingHistory row.
- The 5th rating within 24h from 5 new accounts is HELD and a SUSPICIOUS_RATINGS review item exists.
- pnpm test passes.

Commit as: feat(rating): rating flow, abuse controls, incremental ranking
```

---

## Prompt 5 — Phase 4: ranking pages, SEO, nightly recompute

```
Implement Phase 4 from docs/08 using docs/04 (query, eligibility, recomputeAll) and docs/01 (screens, copy guidelines).

1. RankingService.getRanking({ citySlug, dishSlug, areaSlug?, sort, lat?, lng?, radiusKm?, limit }) → { eligible, insufficient, mode, thresholds, computedAt } using the SQL in docs/04 and splitting by thresholds (bootstrap mode while City.launchedAt is NULL or within 60 days of it). The page calls it with city and dish only; areaSlug, sort and lat/lng serve GET /api/v1/rankings. Ranks are always city-wide. Distance (lat/lng/radiusKm): DO NOT BUILD until the owner decides the Phase 4 open question on distance and Google coordinates (docs/OPEN-QUESTIONS.md).
2. Pages (RSC, export const revalidate = 3600):
   - /[city]/best-[dish]: H1 "Best <Dish> in <City>", intro line with counts and mode label ("Early rankings" in bootstrap), FilterBar (client component: area select, sort by score/votes/price, and by distance when the visitor shares a location (our own restaurant coordinates; rows without a location have no distance); it filters and sorts the cached rows in the browser and never renumbers ranks; the server page never reads searchParams), RankingList rows: rank, restaurant name (link), area, score "8.3 · 23 votes", price if present, variant tags, "Rate this" button; then "Not enough votes yet" list; EligibilityNote linking to /how-rankings-work; share button (Web Share API fallback copy link).
   - /[city]/r/[slug]: header (name, area, address, price band, map link by our own lat/lng when the location is known), dishes sorted eligible-by-score then by votes, each with score/votes/rank and "Rate" link, "Upload menu photo" (signed-in), "Report a problem" (flags). Show "Claimed" badge if claimed.
   - / and /[city]: city picker, launch dish grid with eligible counts, "Rate a dish" CTA.
   - Static pages: /how-rankings-work (plain-language version of docs/04 + trust rules from docs/01), /dispute (form → ReviewItem FLAG with reason OTHER + email to ADMIN_EMAIL env), /about, /privacy, /terms (placeholders I will edit).
3. SEO: generateMetadata per page (title "Best Chicken Karahi in Islamabad (2026) — DishRank", description with counts), canonical URLs, OpenGraph image route (simple dynamic OG image with dish + city + top 3), JSON-LD ItemList of Restaurant items on ranking pages, Restaurant schema on restaurant pages, sitemap.ts (all city×launch-dish pages + restaurant pages), robots.ts.
4. RankingService.recomputeAll() per docs/04 steps 1–7; wire /api/cron/recompute-rankings and scripts/recompute-rankings.ts; /api/cron/mark-stale stays a manual endpoint (not scheduled). JobRun logging. Admin button on /admin/rankings to run it and view last 10 JobRuns. "Launch city" action on /admin sets City.launchedAt = now() once, behind a confirm dialog (launch day only).
5. Revalidation: after rating writes revalidatePath for the exact ranking page (one cached page per city × dish; filters run in the browser, so there is one path), restaurant page, and /[city].
6. Performance: no client components on ranking pages except FilterBar and share button; images via next/image with sizes; Lighthouse mobile performance ≥ 90 on a seeded page.

Acceptance:
- Seeded DB with ~40 restaurants and ~150 ratings (write a dev script scripts/dev-fake-ratings.ts guarded by NODE_ENV !== 'production') renders a ranking page with eligible + insufficient sections.
- JSON-LD validates in Google's Rich Results test (I will run it); sitemap lists pages.
- Running the cron endpoint with the secret updates rankInCity and creates a JobRun.

Commit as: feat(ranking): ranking pages, seo, nightly recompute
```

---

## Prompt 6 — Phase 5: menu ingestion + review queue

```
Implement Phase 5 from docs/08 using docs/07 §3 and §6 and docs/05.

1. src/server/vision/parseMenu.ts: Anthropic SDK, model from ANTHROPIC_VISION_MODEL, image input (fetch from Supabase Storage via service key), tool `extract_menu` with the JSON schema and the system prompt verbatim from docs/07. Handle oversized images by downscaling server-side with sharp to ≤ 1600px. Return typed sections/items. Unit-test the response mapper with a fixture JSON (no network).
2. MenuService.parse(uploadId): status transitions PENDING → PARSED/FAILED, MenuItem rows, matching via matchDish(rawName, { section, allowLlm: true }), RD upserts at conf ≥ 0.85 (MENU_VERIFIED, source MENU_PHOTO, price = min across size variants, variantTags, menuName, lastVerifiedAt), ReviewItems for the rest per docs/07 table. Idempotent (re-parse deletes previous items of that upload).
3. Upload entry points: "Upload menu photo" on restaurant page (signed URL in the private menus bucket under menus/<restaurantId>/), owner route POST /api/v1/owner/restaurants/:id/menus, admin "Parse now", scripts/parse-menu.ts, nightly cron parses ≤ 20 PENDING uploads (add to recompute job as a step).
4. /admin/review: tabs by type, open items first, each with a resolve panel implementing every action in docs/07 §6; resolution writes resolvedBy/resolution/resolvedAt; triggers recomputeOne when ratings change. Keyboard-friendly (j/k, enter) is a nice-to-have, not required.
5. /admin/menu-uploads/[id]: image preview + items grouped matched / needs review / ignored; one-click assign for suggestions.
6. Flags: "Report a problem" on restaurant page → POST /api/v1/flags; one OPEN FLAG review item per (RD, reason). Upheld NOT_SERVED ×3 → RD REMOVED; RESTAURANT_CLOSED upheld → restaurant CLOSED.
7. Proposals: DISH_PROPOSAL resolve → create dish (slug, name, category) and its DishAlias rows (normalised); RESTAURANT_PROPOSAL resolve → find the place among the Overture candidates on /admin/import and Create or Link it there, or add it by hand (adminRestaurantInput, as on /admin/restaurants/new).

Acceptance:
- Parsing a real desi menu photo auto-matches ≥ 80% of items; the rest show in the queue with suggestions and can be assigned in one click.
- A rejected/upheld flag changes RD/restaurant status and the ranking page updates after revalidation.
- pnpm test passes (mapper + matching + resolution services).

Commit as: feat(menus): vision menu parsing, review queue, flags and proposals
```

---

## Prompt 7 — Phase 6: owner area, hardening, launch prep

```
Implement Phase 6 from docs/08 using docs/07 §4, docs/06 (owner endpoints), and docs/11-REVIEW-CHECKLIST.md.

1. Owner claim: /owner/claim (pick restaurant via search, phone, proof note) → OwnerClaim + ReviewItem OWNER_CLAIM; admin approve sets role OWNER, claimedByUserId, blocks self-rating. Reject with reason shown to the user.
2. /owner/restaurants/[id]: dish list with Confirm (→ OWNER_VERIFIED), Remove (→ REMOVED with reason), edit menuName/price/variantTags; menu upload; basic report: per dish rank, score, votes, 7-day change vs last RankingSnapshot, top 3 competitors in the same area (names + scores only). No rater identities anywhere.
3. Security pass: verify every server action and /api/v1 handler calls requireUser/requireRole; Zod on every input; storage path ownership checks; comment length; CSP and security headers in next.config.ts; dependency audit; secrets only from env; disable dev scripts in production.
4. Performance pass: run EXPLAIN on the ranking query and confirm the (cityId, dishId, status, score) index is used; check bundle size of public pages; ensure no N+1 in restaurant page.
5. Analytics: Vercel Analytics component + an `Event` table with (name, cityId?, dishId?, restaurantId?, userId?, createdAt) and a helper track(); record rating_submitted, search, ranking_view, restaurant_view, menu_uploaded. /admin dashboard: counts last 7/30 days, ratings per launch dish, eligible dishes per city, open review items, last JobRuns.
6. Go through docs/11-REVIEW-CHECKLIST.md and produce a report: each item ✅ / ❌ with file references. Fix all ❌ in security and data-policy sections before finishing.

Acceptance:
- Owner can claim, be approved, confirm dishes, and see the report; cannot rate own restaurant; cannot see rater identities.
- Checklist report attached in docs/LAUNCH-REPORT.md with zero open security/data-policy items.

Commit as: feat(owner): claims, owner dashboard, hardening and analytics
```

---

## Prompt 8 — Audit (run before launch and after any big change)

```
Act as a reviewer who has not seen this code before. Read CLAUDE.md and docs/11-REVIEW-CHECKLIST.md. Then inspect the repo and answer, with file:line references:

1. Which server actions, /api/v1 handlers, admin/owner pages or admin/owner services can run without the right role? List any missing requireUser/requireRole/requirePageRole, any admin service that does not take and check the current user, any cron handler that does not fail closed, and any missing Zod parse.
2. Is any Google Places code, key or data left anywhere, and does every restaurant pass an admin's review? (tests/unit/ops/no-google-places.test.ts; docs/07 §1–2.)
3. Can any user create a Dish row outside the admin resolve flow?
4. Can an RD get a rank number while below thresholds? Trace getRanking and the page.
5. What happens if ANTHROPIC_API_KEY is missing? (Should degrade gracefully.)
6. Any N+1 queries on ranking or restaurant pages? Any client components that could be server components?
7. Any TODOs without an entry in docs/OPEN-QUESTIONS.md?

Fix every issue in categories 1–4 immediately and describe the fix. For 5–7, fix if < 30 min each; otherwise add to docs/OPEN-QUESTIONS.md with a proposed fix.
```

---

## Fix prompt (template for bugs and gaps)

```
Bug/gap: <one sentence of what is wrong, with the URL or command>.
Expected: <what docs/XX says should happen (quote the section)>.
Actual: <what happens; paste error/log>.

Find the root cause before changing code; explain it in two lines. Fix it with the smallest change consistent with CLAUDE.md, add or update a test that would have caught it, run lint/typecheck/tests, and summarize files touched. Do not refactor unrelated code.
```

## Feature prompt (template for anything not in the docs)

```
New requirement: <describe>.
First update the relevant doc(s) in docs/ (spec/API/data model) to include it, show me the diff, and wait for my OK. Then implement with tests. Keep CLAUDE.md rules.
```
