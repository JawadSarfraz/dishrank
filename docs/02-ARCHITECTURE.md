# 02 — Architecture

Diagrams are Mermaid. They render on GitHub and in VS Code with the "Markdown Preview Mermaid Support" extension. Standalone copies live in `docs/diagrams/*.mmd`.

## Principles

1. **One deployable.** A single Next.js app serves pages, server actions, JSON API, cron endpoints. No separate backend in v1.
2. **Services own logic.** Pages/actions/handlers are thin; `src/server/services/*` is the only place with business rules.
3. **Read-heavy, write-light.** Rankings are precomputed into `restaurant_dishes` aggregates; public pages are ISR.
4. **Own your data.** External APIs (Google Places, Anthropic) are used to *propose* data; humans or our own users *confirm* it.
5. **Everything auditable.** Rating history, review queue resolutions, status transitions are recorded.

## System context

```mermaid
flowchart LR
  Diner((Diner)) -->|browse rankings, rate dishes| App["DishRank web app<br/>Next.js on Vercel"]
  Panel((Tasting panel)) -->|seed ratings, menu photos| App
  Owner((Restaurant owner)) -->|claim, fix menu, view report| App
  Admin((Admin)) -->|imports, review queue, moderation| App
  App --> DB[("PostgreSQL<br/>Supabase")]
  App --> Store[("Object storage<br/>Supabase Storage")]
  App -->|OAuth sign-in| GAuth["Google OAuth"]
  App -->|seed candidates only| Places["Google Places API (New)"]
  App -->|menu photo to JSON, matcher fallback| LLM["Anthropic API"]
  Cron["Vercel Cron"] -->|nightly recompute, daily Places refresh| App
```

## Containers

```mermaid
flowchart TB
  subgraph Vercel["Vercel (region bom1)"]
    subgraph Next["Next.js app"]
      Pages["Public pages (RSC, ISR)<br/>/ /[city] /[city]/best-[dish] /[city]/r/[slug]"]
      Rate["Rating flow (client form + server actions)"]
      OwnerUI["Owner area (role OWNER)"]
      AdminUI["Admin area (role ADMIN)"]
      API["Route handlers /api/v1/*"]
      CronEP["Cron endpoints /api/cron/* (CRON_SECRET)"]
      Services["src/server/services<br/>ranking · matching · rating · restaurant · menu · claims · review"]
      Repos["src/server/repositories (Prisma)"]
      Ext["src/server/places · src/server/vision"]
    end
  end
  subgraph Supabase
    PG[("Postgres + pg_trgm")]
    ST[("Storage: dish-photos (public), menus (private)")]
  end
  CLI["scripts/* (local CLI, tsx)"]
  Pages --> Services
  Rate --> Services
  OwnerUI --> Services
  AdminUI --> Services
  API --> Services
  CronEP --> Services
  Services --> Repos --> PG
  Services --> ST
  Ext --> Google["Google Places API"]
  Ext --> Anthropic["Anthropic API"]
  Services --> Ext
  CLI --> Services
```

## Key flows

### Rating submission

```mermaid
sequenceDiagram
  actor U as Diner
  participant P as /rate page
  participant A as action submitRating
  participant RS as RatingService
  participant RK as RankingService
  participant R as Repositories
  participant DB as Postgres
  U->>P: search restaurant (trigram) → pick dish → score 1-10 (+photo)
  P->>A: submitRating(payload)
  A->>A: requireUser(), zod parse, rateLimit(user, "rating")
  A->>RS: createOrReplace(userId, payload)
  RS->>R: ensure RestaurantDish exists (create CANDIDATE if user added)
  RS->>R: upsert Rating (unique restaurantDishId+userId), insert RatingHistory
  RS->>RS: abuse checks (burst, owner-self-rating, new-account limits)
  RS->>RK: recomputeOne(restaurantDishId)
  RK->>DB: SELECT active ratings → compute W, R, score → UPDATE restaurant_dishes
  RK->>R: maybe promote status CANDIDATE→USER_CONFIRMED (3 distinct raters)
  A->>A: revalidatePath(ranking page, restaurant page)
  A-->>P: { ok, score, eligible }
  P-->>U: "Thanks — Butt Karahi is #3 for Chicken Karahi in F-7"
```

### Ranking page render

```mermaid
sequenceDiagram
  participant G as Googlebot / Diner
  participant N as Next.js (ISR)
  participant RK as RankingService
  participant DB as Postgres
  G->>N: GET /islamabad/best-chicken-karahi?area=f-7
  N->>RK: getRanking(city, dish, {area, sort})
  RK->>DB: SELECT restaurant_dishes JOIN restaurants WHERE city, dish, status IN (...) ORDER BY score DESC
  DB-->>RK: eligible rows + insufficient rows
  RK-->>N: { eligible[], insufficient[], meta }
  N-->>G: HTML + JSON-LD ItemList (cached 1h, revalidated on new rating)
```

### Candidate search (Google Places) — Google data shown, never saved

```mermaid
flowchart LR
  A["/admin/import<br/>admin picks dish + area"] --> Q["Places Text Search (live)<br/>'chicken karahi F-7 Islamabad'<br/>rectangle around F-7, no cache"]
  Q --> R["Results shown to the admin only<br/>name, address, Maps link: never saved"]
  R --> C["Create: admin types name + address<br/>or Link to an existing restaurant"]
  C --> RD["Saved: googlePlaceId, lat/lng, fetch time<br/>+ RestaurantDish CANDIDATE source=GOOGLE_SEARCH conf=0.4"]
  P["pnpm seed:places (planning)<br/>place ids only, counts, no file"] -.-> Q
```

### Menu ingestion (photo → structured dishes)

```mermaid
flowchart LR
  Up["Panel/owner uploads menu photo"] --> ST["Supabase Storage menus/"]
  ST --> MU["MenuUpload PENDING"]
  MU --> V["VisionService: Anthropic API<br/>image + JSON schema (tool use)"]
  V --> MI["MenuItem rows (rawName, rawPrice)"]
  MI --> M["MatchingService<br/>normalize → alias → trigram → LLM"]
  M -->|conf ≥ 0.85| RDV["RestaurantDish MENU_VERIFIED"]
  M -->|0.45–0.85| RQ1["ReviewItem UNMATCHED_MENU_ITEM (suggested dish)"]
  M -->|< 0.45| RQ2["ReviewItem UNMATCHED_MENU_ITEM (no suggestion)"]
  RQ1 --> Admin["Admin resolves"] --> RDV
  RQ2 --> Admin
```

### RestaurantDish lifecycle

```mermaid
stateDiagram-v2
  [*] --> CANDIDATE: Google seed / user adds dish
  CANDIDATE --> USER_CONFIRMED: 3 distinct raters
  CANDIDATE --> MENU_VERIFIED: menu item matched at conf 0.85 or more, or admin
  USER_CONFIRMED --> MENU_VERIFIED: menu item matched
  USER_CONFIRMED --> OWNER_VERIFIED: owner confirms
  MENU_VERIFIED --> OWNER_VERIFIED: owner confirms
  CANDIDATE --> STALE: 9 months, no rating/verification
  USER_CONFIRMED --> STALE: 9 months, no rating/verification
  MENU_VERIFIED --> STALE: 12 months, no rating/verification
  OWNER_VERIFIED --> STALE: 12 months, no rating/verification
  STALE --> USER_CONFIRMED: new rating
  USER_CONFIRMED --> REMOVED: 3 upheld not-served flags
  MENU_VERIFIED --> REMOVED: owner/admin removes
  OWNER_VERIFIED --> REMOVED: owner/admin removes
  REMOVED --> [*]
```

Ranking eligibility is independent of status: a row ranks if `status IN (USER_CONFIRMED, MENU_VERIFIED, OWNER_VERIFIED)` **and** it meets the vote thresholds in docs/04. `CANDIDATE` rows appear only in "also serves (unverified)".

## Deployment

```mermaid
flowchart LR
  Dev["Developer laptop<br/>VS Code + Claude Code"] -->|git push| GH["GitHub repo"]
  GH -->|preview per PR| VP["Vercel Preview"]
  GH -->|main| VProd["Vercel Production<br/>dishrank.pk"]
  VProd --> SB[("Supabase project (ap-south-1)<br/>Postgres + Storage")]
  VProd --> Cron["Vercel Cron<br/>02:00 PKT recompute<br/>daily Places refresh"]
  VProd --> Ant["Anthropic API"]
  VProd --> GP["Google Places API"]
  VProd --> GO["Google OAuth"]
```

## Directory structure

```
dishrank/
├── CLAUDE.md
├── README.md
├── .env.example
├── .nvmrc                           # 24 (Node.js 24 LTS; package.json engines "24.x")
├── package.json  pnpm-lock.yaml  tsconfig.json  next.config.ts  vercel.json
├── postcss.config.mjs  components.json  eslint.config.mjs   # Tailwind 4 has no tailwind.config.ts; shadcn/ui config; ESLint flat config
├── prisma.config.ts                 # Prisma 7: schema path, migrations, seed command, CLI url = DIRECT_URL
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                      # loads seed/*.json
├── seed/
│   ├── cities.json  areas.json  dishes.json  dish-categories.json  variant-tags.json  meat-words.json
├── docs/                            # the planning kit (specs, plans, prompts)
├── scripts/
│   ├── seed-places.ts               # planning: Places counts and call estimates (place ids only, no file)
│   ├── parse-menu.ts                # one MenuUpload → MenuItems + matching
│   └── recompute-rankings.ts        # calls RankingService.recomputeAll()
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   ├── page.tsx                         # /
│   │   │   ├── [city]/page.tsx                  # /islamabad
│   │   │   ├── [city]/best-[dish]/page.tsx      # /islamabad/best-chicken-karahi
│   │   │   ├── [city]/r/[slug]/page.tsx         # restaurant page
│   │   │   ├── how-rankings-work/  dispute/  about/  privacy/  terms/
│   │   │   └── sitemap.ts  robots.ts
│   │   ├── (app)/
│   │   │   ├── rate/page.tsx                    # rating flow
│   │   │   ├── me/page.tsx
│   │   │   └── sign-in/page.tsx             # target of the signed-out redirect (?callbackUrl=)
│   │   ├── owner/  (layout.tsx and every page call requirePageRole)  claim/  restaurants/[id]/
│   │   ├── admin/  (layout.tsx and every page call requirePageRole)  import/  review/  restaurants/  users/  rankings/
│   │   ├── api/
│   │   │   ├── v1/ cities/ dishes/ rankings/ restaurants/ ratings/ restaurant-dishes/ flags/ uploads/ owner/ admin/
│   │   │   ├── cron/ recompute-rankings/ refresh-places/ mark-stale/   # mark-stale: manual only
│   │   │   └── auth/[...all]/           # Better Auth handler: toNextJsHandler(auth)
│   │   ├── layout.tsx  globals.css  not-found.tsx  error.tsx   # globals.css: @import "tailwindcss" + @theme tokens (Tailwind 4)
│   ├── components/
│   │   ├── ui/            # shadcn
│   │   ├── ranking/       # RankingList, RankingRow, EligibilityNote, FilterBar
│   │   ├── rating/        # RestaurantSearch, DishPicker, ScoreInput, PhotoUpload
│   │   ├── restaurant/    # RestaurantHeader, DishScoreList
│   │   ├── layout/        # Nav, Footer, CityPicker
│   │   ├── auth/          # Forbidden (shown to signed-in users without the role)
│   │   └── admin/         # import preview, restaurant forms, merge dialog (admin pages only)
│   ├── server/
│   │   ├── auth.ts                 # Better Auth instance (prismaAdapter, Google, nextCookies), requireUser(), requireRole()
│   │   ├── db.ts                   # Prisma client singleton on the @prisma/adapter-pg driver adapter
│   │   ├── errors.ts               # AppError
│   │   ├── rate-limit.ts           # DB-backed sliding window
│   │   ├── actions/                # submitRating, addRestaurantDish, flag, claim, admin*
│   │   ├── services/
│   │   │   ├── ranking.service.ts  # score math, eligibility, recomputeOne/All
│   │   │   ├── rating.service.ts
│   │   │   ├── matching/           # normalize.ts aliases.ts trigram.ts llm.ts index.ts
│   │   │   ├── restaurant.service.ts
│   │   │   ├── menu.service.ts
│   │   │   ├── claim.service.ts
│   │   │   └── review.service.ts
│   │   ├── repositories/           # *.repo.ts, Prisma only
│   │   ├── places/                 # textSearch.ts, placeDetails.ts (field masks)
│   │   ├── vision/                 # parseMenu.ts (Anthropic tool-use JSON schema)
│   │   └── validation/             # zod schemas shared by actions + API
│   ├── lib/                        # slug.ts, geo.ts (haversine), dates.ts, cn.ts
│   ├── generated/prisma/           # Prisma 7 client output (gitignored; `prisma generate`)
│   ├── env.ts                      # Zod-validated env; production fails fast at startup
│   ├── instrumentation.ts          # register() imports env.ts
│   └── types/
├── tests/
│   ├── unit/   matching/ ranking/ slug/ normalize/
│   └── e2e/    rate-flow.spec.ts  ranking-page.spec.ts  admin-review.spec.ts
└── tmp/        (gitignored) menu images for local parse
```

## Cross-cutting

| Concern | Decision |
|---|---|
| Auth | Better Auth (ADR-11): Google sign-in, Prisma adapter, database sessions. The session cookie cache stays off, so every check reads the session and `User.role` from the DB and role changes apply at once. `role` is a Better Auth additional field with `input: false`, so no client can set it. `requireUser()` / `requireRole(role)` in `src/server/auth.ts` wrap `auth.api.getSession({ headers })` and throw `AppError` 401/403; actions and handlers call them first. Admin/owner services take the current user (`actor`) as their first argument and call `requireRole` themselves, so a page that forgets its check still cannot read admin data. Layouts and every page under `admin/` and `owner/` call `requirePageRole(role)`: signed-out visitors are redirected to `/sign-in?callbackUrl=…`; signed-in users without the role see the `Forbidden` component (HTTP 200, `noindex`) and no admin data is fetched. Next.js `forbidden()` is not used because it is still experimental (`authInterrupts`). |
| Validation | Zod schemas in `src/server/validation`, shared by actions and API. |
| Rate limiting | `rate_limit_buckets` table, sliding window per `(key, action)`. Limits in docs/06. |
| Caching | Public pages `revalidate = 3600`; `revalidatePath` after rating write for the affected ranking + restaurant pages. Ranking pages never read `searchParams`: one cached page per city × dish, with area filter, sort and distance in the browser and city-wide rank numbers. |
| Geo | `lat/lng` columns; distance via haversine SQL expression; no PostGIS in v1 (ADR-5). |
| Search | `pg_trgm` GIN indexes on `restaurants.name`, `restaurants.search_text` and `dish_alias.alias` (one row per dish spelling; matched one alias at a time, docs/05). |
| Jobs | `/api/cron/*` secured by `Authorization: Bearer CRON_SECRET`, failing closed: 500 when the secret is unset, 401 on mismatch, constant-time compare. Idempotent; log run and external call counts in `job_runs`. Two scheduled crons: recompute (with stale marking) and the daily Places refresh. |
| Env | `src/env.ts` parses `process.env` with Zod. `src/instrumentation.ts` imports it in `register()`, so a production server with a missing or malformed required variable fails at startup; in development it logs the problems. Server code reads config only from `env`, never `process.env`. |
| Observability | Vercel logs + optional Sentry (free tier). Every service logs `{ action, userId, entityId, durationMs }`. |
| Images | Client resizes to ≤ 1600px and re-encodes through canvas before upload, which strips EXIF/GPS metadata. Dish photos go to the public `dish-photos` bucket under random cuid file names; menu photos go to the private `menus` bucket. Uploads use Supabase signed upload URLs (fixed 2 h validity, one path each) issued only by `/api/v1/uploads/sign`; the DB stores the path, not a URL. |
| i18n | English only; `lang="en"`; dish aliases carry Roman Urdu. |

## ADRs (architecture decision records)

| # | Decision | Why | Revisit when |
|---|---|---|---|
| ADR-1 | Single Next.js app, no separate API service | One deploy, server actions remove boilerplate, free tier | Native app needs its own API surface (then `/api/v1` already exists) |
| ADR-2 | Postgres + Prisma on Supabase | Relational data, trigram search, free tier, storage included | > 500 MB DB or need PostGIS |
| ADR-3 | TypeScript only in v1 (no Python) | One language, one toolchain | Heavy NLP batch work |
| ADR-4 | Google Places only to find candidates (shown, never saved); we keep just the place id and a ≤ 30-day location; humans type name and address | Policy compliance + data we own | Never |
| ADR-5 | No PostGIS; haversine on lat/lng | City-scale data, simpler Prisma | Multi-city nearby search at scale |
| ADR-6 | Ratings 1–10 + Bayesian score; pairwise votes deferred | Simple to explain, enough signal early | Phase 7 (pairwise/Bradley-Terry blend) |
| ADR-7 | Precomputed aggregates on `restaurant_dishes` | Ranking page is one indexed query | Need per-user personalised ranking |
| ADR-8 | ISR public pages + on-demand revalidation | SEO + speed on 3G | Real-time needs |
| ADR-9 | DB-backed rate limiting (no Redis) | Fewer services | Traffic > ~50 req/s |
| ADR-10 | Admin verifies owner claims manually | Trust > speed at launch | > 20 claims/week |
| ADR-11 | Better Auth replaces Auth.js v5: Google sign-in, Prisma adapter, database sessions, same roles and `requireUser()` / `requireRole()` | Auth.js v5 never left beta (`next-auth@5.0.0-beta.32` in Oct 2026) and is in maintenance under the Better Auth team; Better Auth 1.7 is stable and supports Next.js 16 and Prisma 7 | Phone OTP (Phase 7) or a native app needs another sign-in method |
| ADR-12 | Pinned versions: Node.js 24 LTS, Next.js 16 (stable), Prisma ORM 7 (latest stable 7.x, not the 8.0 release candidate that npm `latest` installs) | Node 20 is end-of-life; Next.js 16 is the current stable major; Prisma 7 needs `prisma.config.ts` and a driver adapter (`@prisma/adapter-pg`) | Prisma 8 is GA plus one patch release; Node 26 becomes the Vercel default |
