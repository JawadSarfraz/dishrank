# DishRank — project guide for Claude Code

Read this file fully before any task. Then read `docs/` in this order:
`01-PRODUCT-SPEC` → `02-ARCHITECTURE` → `03-DATA-MODEL` → `04-RANKING` → `05-DISH-TAXONOMY` → `06-API-SPEC` → `07-DATA-PIPELINES` → `08-IMPLEMENTATION-PLAN`.
Prompts for each phase are in `docs/09-CLAUDE-CODE-PROMPTS.md`. Open questions go in `docs/OPEN-QUESTIONS.md`.

## What this product is

Dish-first restaurant ranking for Pakistan. A user picks a **city + a dish**
(e.g. "Chicken Karahi" in Islamabad) and sees restaurants ranked 1, 2, 3… **for that dish**,
based on dish-level ratings from real diners.

- Restaurants are never rated as a whole. A restaurant's score is derived from its dishes.
- Users can only rate dishes from a canonical dish list (no free-text dishes).
- A (restaurant, dish) pair ranks only once it has enough votes; otherwise it shows as "not enough votes yet".

v1 scope: Islamabad + Rawalpindi, ~19 launch dishes, web only (mobile-first), English UI,
Roman-Urdu-tolerant search (karahi / kadai / karhai all work).

## Stack (fixed — do not swap without adding an ADR in docs/02)

- Node.js 24 LTS (`.nvmrc` = `24`, `package.json` `engines.node` = `"24.x"`), pnpm
- Next.js 16 (stable), App Router, TypeScript 6.0 strict (not 7.0: typescript-eslint supports < 6.1), React Server Components, Server Actions, Route Handlers
- Tailwind CSS 4 (CSS-first config in `globals.css`, no `tailwind.config.ts`) + shadcn/ui
- PostgreSQL on Supabase, accessed with Prisma ORM 7 (latest stable 7.x, never the 8.0 release candidate): `prisma.config.ts` + driver adapter `@prisma/adapter-pg`. Extensions: `pg_trgm`, `unaccent`
- Better Auth with Google sign-in, Prisma adapter and database sessions; roles `USER | OWNER | ADMIN` enforced by `requireUser()` / `requireRole()` (ADR-11)
- Supabase Storage for photos (menu photos, dish photos)
- Anthropic API (Claude) for menu-photo → JSON and as the last-resort dish matcher
- Google Places API (New) for **seeding candidates only**
- Zod for all input validation
- Vitest (unit), Playwright (e2e), ESLint + Prettier, pnpm
- Deploy on Vercel; scheduled jobs via `vercel.json` crons hitting `/api/cron/*`

## Commands

```
pnpm dev              # local dev server
pnpm build            # production build
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest
pnpm test:e2e         # playwright
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # seed cities, areas, dish taxonomy from seed/*.json
pnpm db:studio        # prisma studio
pnpm seed:places -- --city=islamabad --dish=chicken-karahi   # writes tmp/candidates-*.csv, never the DB
pnpm menu:parse  -- --upload=<menuUploadId>                   # parse one menu upload via vision model
pnpm rankings:recompute                                       # full recompute (same code as the nightly cron)
```

## Non-negotiable rules

1. **No scraping.** Never scrape Google Maps, foodpanda, Instagram, or any site. The only Google data source is the official Places API (New) called from `src/server/places/*`.
2. **Google data policy.** From Places we persist only `googlePlaceId` (indefinitely) and `lat/lng` (refreshed within 30 days). Restaurant `name`, `address`, `phone` in our DB are entered/confirmed by a human (panel, owner, admin) and are our own records. Seed scripts write CSVs to `tmp/`, never straight into the DB.
3. **Rankings use only our own ratings.** No imported scores from anywhere.
4. **Thin data never ranks.** Eligibility rules in `docs/04-RANKING.md` are enforced in the query, not just in the UI.
5. **No free-text dish creation by users.** Users pick from `dishes`. Unknown names become a `ReviewItem` for admin.
6. **Server-side authorization.** Admin/owner routes check role in the route-group layout **and** in every server action / route handler. Never trust a client-provided role.
7. **Every write path**: Zod validation + rate limit (`src/server/rate-limit.ts`) + audit-friendly logging.
8. **Mobile-first and light.** Public pages are ISR (revalidate 3600s), usable at 360px width on 3G: minimal client JS, lazy images, no heavy chart libs on public pages.
9. **No factual claims about hygiene, adulteration, or health anywhere in UI copy.** Ratings are opinions. Comments are moderated; the dispute page is linked in the footer.
10. **Secrets** only via env vars; `.env.example` lists every variable with a comment.

## Conventions

- Layout per `docs/02-ARCHITECTURE.md` §Directory structure. Business logic lives in `src/server/**`, never inside React components or route files.
- DB access only via `src/server/repositories/*`. Services in `src/server/services/*`. Server actions in `src/server/actions/*` are thin: auth → validate → call service → revalidate.
- Route handlers under `src/app/api/v1/**` call the **same services** as server actions.
- IDs: `cuid2` strings. Slugs: lowercase ASCII with hyphens (`chicken-karahi`, `butt-karahi-f-7`).
- Ratings are integers 1–10. Scores are `Decimal(5,3)`. Prices are PKR integers.
- Timestamps stored in UTC; display in `Asia/Karachi`.
- Errors: throw `AppError(code, message, status)` from services; actions/handlers map to `{ error: { code, message } }`.
- Tests: pure logic (`matching`, `ranking`, `slug`, `normalize`) must have unit tests. Every migration must have a seed that still runs.
- Commits per task: `feat(scope): …`, `fix(scope): …`, `chore: …`. Run `pnpm lint && pnpm typecheck && pnpm test` before each commit.

## Definition of done (any task)

- Code + tests + docs updated if behavior changed + migration if schema changed
- `pnpm lint && pnpm typecheck && pnpm test` pass
- No `TODO` in code without a matching line in `docs/OPEN-QUESTIONS.md`
- Short summary of what changed and how to verify it

## When unsure

Do not invent product behavior. Pick the simplest safe default, mark it with
`// DECISION-PENDING: <question>` and add the question to `docs/OPEN-QUESTIONS.md`. Then continue.

## Glossary

- **Dish**: canonical entry in `dishes` (e.g. Chicken Karahi). Variants (white, boneless, Peshawari) are **tags**, not new dishes.
- **RestaurantDish**: the fact that restaurant R serves dish D, with `status` (`CANDIDATE → USER_CONFIRMED → MENU_VERIFIED → OWNER_VERIFIED`, or `STALE` / `REMOVED`) and aggregate stats.
- **Rating**: one user's 1–10 score for one RestaurantDish. One active rating per user per RestaurantDish; re-rating replaces it (history kept).
- **Ranking**: the ordered list of eligible RestaurantDish rows for a (city, dish) by `score`.
- **Panel**: trusted early raters (admin-only `isPanel` flag, trust fixed at 1.3), used to seed the first ratings.
- **Review queue**: `ReviewItem` rows an admin resolves (unmatched menu items, dish proposals, flags, suspicious bursts, owner claims).
