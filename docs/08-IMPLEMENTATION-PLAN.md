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

## Phase 2 — Restaurants: live Places search + admin import (6–8 h)

Tasks
- `src/server/places/textSearch.ts` (field masks incl. `nextPageToken`, `locationRestriction` rectangle, pagination, regionCode PK, never cached), `placeDetails.ts` (location only)
- `scripts/seed-places.ts`: planning tool only (place ids, per-area counts and call estimates, no file)
- `/admin/import`: live Text Search by dish and area (Google name and address shown, never saved; Load more), dedupe, Create (admin types name and address) / Link / Skip, `googleSyncedAt` = the search's fetch time, RD CANDIDATE creation, Google Maps logo
- `/admin/restaurants`: list/search/edit/merge/status; merge per docs/07 §2 with redirect of merged URLs
- `/api/cron/refresh-places`: daily refresh with failure handling per docs/07 §5
- `RestaurantService`, `restaurant.repo.ts`, trigram search endpoint

Acceptance
- Search 2 dishes live in /admin/import and import ≥ 40 restaurants in Islamabad with areas, typing each name and address; `/api/v1/restaurants/search?q=but karahi` returns Butt Karahi; the Google-data guard tests pass (no Google name, address or error text in the DB, files or logs; no Google response cached).

## Phase 3 — Rating flow (8–10 h)

Tasks
- `/rate`: restaurant search → dish picker (launch dishes first, trigram search, "add dish") → score 1–10 → optional taste/portion/value, photo (signed upload, client resize), comment → submit
- `RatingService.createOrReplace` with abuse checks from docs/04; `RatingHistory`; `rate-limit.ts`
- `RankingService.recomputeOne` (score math + status promotion)
- `/me`: list, edit, delete own ratings
- Unit tests for ranking math and abuse rules

Acceptance
- On a phone-sized viewport, rating a dish takes ≤ 30 s and 4 taps; a 5th rating from a new account within 24 h is HELD and a review item appears.

## Phase 4 — Ranking pages + SEO (8–10 h)

Tasks
- `RankingService.getRanking` (eligible/insufficient split, bootstrap mode, filters, distance)
- `/[city]/best-[dish]`: list, browser-side filter bar (area, sort, distance; ranks stay city-wide), "Not enough votes yet" section, eligibility note, share button
- `/[city]/r/[slug]`: restaurant page with dish scores + "Rate" buttons + "Upload menu photo"
- `/`, `/[city]`: dish grids with eligible counts
- Metadata: title/description per page, canonical, OpenGraph, JSON-LD `ItemList` + `Restaurant`; `sitemap.ts`, `robots.ts`
- ISR 3600s + `revalidatePath` after rating writes
- Trust pages: `/how-rankings-work`, `/dispute`, `/about`, `/privacy`, `/terms`
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
