# 08 — Implementation plan

Solo developer, evenings/weekends. Estimates are focused hours, not calendar days. Each phase ends with a demo you can click through and a commit on `main`.

Walking skeleton first: by the end of Phase 4 a stranger can open a ranking page, sign in, rate a dish, and see the rank change. Everything else makes that loop stronger.

## Phase 0 — Scaffold (4–6 h)

Tasks
- Node.js 24 LTS pinned (`.nvmrc`, `engines`), Next.js 16 + TS strict + Tailwind + shadcn/ui + ESLint/Prettier + Vitest + Playwright
- Prisma 7 + Supabase connection: `prisma.config.ts` (direct URL for the CLI), `src/server/db.ts` (pooled URL through `@prisma/adapter-pg`)
- Better Auth with Google, Prisma adapter, `requireUser()/requireRole()/requirePageRole()`, `/admin` and `/owner` layouts and pages with role guards, Forbidden page, `/sign-in`
- `src/env.ts` (Zod-validated env, fails fast in production), `.env.example`, `vercel.json` (two daily crons), cron stubs that fail closed, `README.md` with setup steps
- CI: GitHub Action running lint, typecheck, unit tests on PR against a Postgres service container (local dev uses Homebrew PostgreSQL; no Docker)

Acceptance
- `pnpm dev` shows a home page; Google sign-in works locally; signed out, `/admin` redirects to sign-in; signed in as USER, `/admin` shows the Forbidden page and fetches no admin data; cron stubs answer 500 without `CRON_SECRET` and 401 with a wrong token; a production start with a missing required env var fails at startup; CI green.

## Phase 1 — Schema, seed, matching (6–8 h)

Tasks
- `prisma/schema.prisma` from docs/03 + raw SQL migration for `pg_trgm`, `unaccent`, GIN indexes
- `prisma/seed.ts` loading `seed/*.json`; one `DishAlias` row per dish name and alias
- `src/server/services/matching/*` per docs/05 with unit tests for the table in docs/05
- `src/lib/slug.ts`, `src/lib/geo.ts` (haversine) with tests

Acceptance
- `pnpm db:migrate && pnpm db:seed` yields 2 cities, 30 areas, 12 categories, ~80 dishes
- All matching test cases and seed tests pass; `normalize("Chicken White Karahi Full 1kg Rs 2400")` → `"chicken white karahi"`, and `matchDish` on it → `chicken-karahi`, tags `["white"]`, ALIAS 1.0

## Phase 2 — Restaurants: Overture candidates + admin review (6–8 h)

Google Places was dropped on 2026-10-25 (ADR-13); this replaces the first Phase 2 plan (live Places search and refresh cron).

Tasks
- `pnpm overture:sync -- --city=islamabad|rawalpindi|all [--release=latest] [--margin-km=5]`: Overture Maps food and drink places from Meta and Microsoft only, Google links stripped, placeholder points = location unknown, city and suggested area from our seed areas, staged in `OvertureCandidate`; a newer release only adds new GERS ids (docs/07 §1)
- `/admin/import`: review one area at a time by confidence; Create (form prefilled from Overture, launch dishes pre-ticked) / Link / Skip with a reason / Reopen; likely duplicates within 50 m; RD CANDIDATE (source ADMIN, 0.4) per ticked dish (docs/07 §2)
- `/admin/restaurants`: list/search/edit/merge/status, "Add restaurant" by hand (`/admin/restaurants/new`, optional location); merge per docs/07 §2 with redirect of merged URLs
- `Restaurant.source` (OVERTURE | MANUAL), `overtureId`, `locationSource` (OVERTURE | ADMIN), `website`
- Public `/about/data` with Overture's credit lines and the CDLA Permissive 2.0 link, linked from the footer
- `RestaurantService`, `restaurant.repo.ts`, trigram search endpoint

Acceptance
- `pnpm overture:sync -- --city=all` stages both cities (release 2026-10-21.0: Islamabad 1,710, Rawalpindi 1,074 candidates); a second run adds nothing.
- An admin reviews ≥ 40 places in Islamabad in about 15 minutes on /admin/import, fixing names to the signboard spelling and ticking dishes; the created restaurants have their area, Overture's coordinates (or none for location-unknown places) and CANDIDATE dishes; `/api/v1/restaurants/search?q=but karahi` returns Butt Karahi.
- `/about/data` shows the credit lines with the licence link, and the footer links it.
- Tests pass: sync filters (sources, food categories, placeholder points, Google-link stripping), area suggestion, duplicates, dish hints, create / link / skip, the credit page, and the guard that no Google Places code returns.

## Phase 3 — Rating flow (8–10 h)

Tasks
- `/rate`: restaurant search ("Can't find it?" files a restaurant suggestion) → dish picker (the restaurant's dishes, launch dishes, trigram search over the canonical list; "Dish not listed? Propose it") → score 1–10 → optional taste/portion/value, photo (10-minute presigned upload, client resize), comment → submit; signed-out users sign in with Google and come back to the same step
- `RatingService.createOrReplace` / `deleteOwn` with abuse checks from docs/04; `RatingHistory`; rating keys in `rate-limit.ts` (the limiter exists since Phase 2)
- `RankingService.recomputeOne` (score math, status promotion, re-rank of the (city, dish) list) and the recompute after a merge
- `/me`: list, edit (reopens /rate prefilled), delete own ratings
- Panel: "I'm at this restaurant now" location observations → location suggestions
- `/admin/users` (panel toggle) and a minimal `/admin/review` for held ratings, bursts, dish and restaurant suggestions and location suggestions (the full queue with menu items, flags and claims stays in Phase 5)
- `pnpm dev:demo [-- --undo]`: local demo data
- Unit tests for ranking math and abuse rules; Playwright at 360 px with a real session cookie

Acceptance
- On a phone-sized viewport (360 px), rating a dish at an existing restaurant takes 4 taps after the search and under 30 s (Playwright).
- Re-rating replaces the old rating and adds a RatingHistory row.
- The 5th rating from new accounts on one dish within 24 h holds all five and a review item appears; panel members are exempt.
- An owner cannot rate their own restaurant.
- A dish row with too few raters shows "needs N more" and never gets a rank.
- `pnpm dev:demo` and `pnpm dev:demo -- --undo` work on the dev database.

## Phase 4 — Ranking pages + SEO (8–10 h)

Tasks
- `RankingService.getRanking` (eligible/insufficient split, bootstrap mode, filters; distance from our own coordinates: Overture or admin-typed)
- `/[city]/best-[dish]`: list, browser-side filter bar (area, sort, distance when the visitor shares a location; ranks stay city-wide), "Not enough votes yet" section, eligibility note, share button
- `/[city]/r/[slug]`: restaurant page with dish scores + "Rate" buttons + "Upload menu photo"
- `/`, `/[city]`: dish grids with eligible counts
- Metadata: title/description per page, canonical, OpenGraph, JSON-LD `ItemList` + `Restaurant`; `sitemap.ts`, `robots.ts`
- ISR 3600s + `revalidatePath` after rating writes
- Trust pages: `/how-rankings-work`, `/dispute`, `/about`, `/privacy`, `/terms` (`/about/data`, the data sources and credits page, exists since Phase 2); link the dispute page in the footer
- `/api/cron/recompute-rankings` + `scripts/recompute-rankings.ts` (`recomputeAll`, DishStat, stale, snapshot, JobRun)

Acceptance
- Lighthouse mobile ≥ 90 performance on the ranking page; JSON-LD validates; cron runs locally with the secret; ranking changes after a rating without redeploy.

## Phase 5 — Menu ingestion + review queue (8–10 h)

Tasks
- `src/server/vision/parseMenu.ts` (Anthropic tool-use, schema in docs/07), `MenuService.parse`
- `scripts/parse-menu.ts`, admin "Parse now" button, nightly parse of PENDING ≤ 20
- `/admin/review`: queue list by type, resolve actions per docs/07 table
- `/admin/menu-uploads/[id]`: matched / needs review / ignored
- Flags + proposals endpoints and UI entry points on restaurant page

Acceptance
- Upload a real menu photo → ≥ 80% of items auto-matched for a desi menu; unmatched ones appear in the queue and can be assigned in one click.

## Phase 6 — Owner area + hardening + launch (8–10 h)

Tasks
- Claim flow + admin approval; owner dishes page (confirm/remove/edit); basic report page
- Security pass: role checks in every action/handler, CSRF (server actions), input limits, storage path validation, headers (CSP basic), dependency audit
- Performance pass: bundle check, image sizes, DB indexes verified with `EXPLAIN` on the ranking query
- Analytics: Vercel Analytics + a tiny event table (`page_view` not needed; track `rating_submitted`, `search`, `ranking_view` with dish/city)
- Error monitoring (Sentry free) — optional
- Launch checklist in docs/11

Acceptance
- docs/11 checklist fully ticked; production deployed on custom domain; 10 panel members onboarded with `isPanel` set (trust 1.3).

## Phase 7 — After launch (only if month-2 metrics are met)

- Pairwise "which was better?" votes + Bradley–Terry blend (docs/04)
- Static area pages `/[city]/best-[dish]/[area]` with their own metadata, only if SEO data shows demand (v1 filters areas in the browser)
- Paid owner report + "Top 3" badge (payments via bank transfer first; JazzCash/Easypaisa later)
- Weekly email/WhatsApp digest to owners
- Second city (Lahore) — needs new areas and a new panel
- Phone OTP login
- Native wrapper (Capacitor) only if web retention is strong

## Timeline (one person, ~10 h/week)

| Week | Phases |
|---|---|
| 1 | 0, 1 |
| 2 | 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 6 + panel onboarding + launch |
| 7–14 | Growth + Phase 7 if metrics hit |

## Research summary that shaped this plan (for context)

- No Pakistani app ranks restaurants per dish; the closest (Rabaat) rates restaurants with sub-scores and rewards. Facebook food groups (80–95k members each in Lahore/Karachi) hold the demand but are unranked.
- Dish-first apps keep getting built worldwide (Foodler 2013, Dish.fm, Foodspotting, DishRank/Ishta/Tasti 2026) and fail on two things: empty-app cold start and no paying customer. Hence: panel seeding, bootstrap-mode thresholds, owner claims/reports from day one.
- Google Maps "popular dishes" and Ask Maps answer "what to order here", not "where to go for this dish" — our SEO pages target the latter phrasing exactly ("best chicken karahi in Islamabad").
- Restaurants pay for tools that bring customers and give them data (commission-free ordering vendors, ~25–30% marketplace commissions). The owner report is the product to sell.
