# DishRank — planning kit

This repo starts as the planning kit for DishRank (dish-first restaurant rankings for Pakistan).
`CLAUDE.md`, `docs/` and `seed/` sit at the repo root; Claude Code builds the app around them.

## 1. Set up the repo

```bash
cd dishrank            # the repo root: CLAUDE.md, README.md, docs/, seed/, .nvmrc
git init && git add . && git commit -m "docs: dishrank kit"
```

Open the folder in VS Code and start Claude Code.

## Local development

Prerequisites: Node.js 24 (`.nvmrc`), pnpm 12.14 (pinned in `package.json`), and Homebrew PostgreSQL with
the same major version as the Supabase projects (17), which ships `pg_trgm` and `unaccent`. No Docker.

```bash
nvm use                                   # Node 24 from .nvmrc
corepack enable                           # pnpm version from package.json
brew install postgresql@17
# Only if another Postgres already uses port 5432:
sed -i '' 's/^#port = 5432/port = 5433/' /opt/homebrew/var/postgresql@17/postgresql.conf
brew services start postgresql@17
/opt/homebrew/opt/postgresql@17/bin/createdb -p 5433 dishrank
cp .env.example .env                      # then fill it in, see below
pnpm install                              # also runs prisma generate
pnpm db:migrate                           # applies prisma/migrations to the local database
pnpm exec playwright install chromium     # once, for pnpm test:e2e
pnpm dev                                  # http://localhost:3000
```

`.env` (gitignored; never commit it). `src/env.ts` validates it: development only logs problems, while a
production `pnpm start` exits with code 1 and names every missing variable.

| Variable | Local value |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | `postgresql://<your mac user>@localhost:5433/dishrank` (same value for both) |
| `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). Authorized JavaScript origin `http://localhost:3000`; authorized redirect URI `http://localhost:3000/api/auth/callback/google` |
| `ADMIN_EMAIL` | your Google account email: it gets role ADMIN on first sign-in |
| `CRON_SECRET` | output of `openssl rand -hex 32` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | from the preview Supabase project (local storage uses the preview project) |
| `SUPABASE_S3_*` (four) | optional: dish photo uploads (Phase 3, docs/10 "Photo storage"); without them `/rate` hides the photo step |
| `ANTHROPIC_*` | optional; used from Phases 1 and 5 |

Commands (same as `CLAUDE.md`):

```
pnpm dev              # local dev server
pnpm build            # production build
pnpm start            # production server (requires every required env var)
pnpm lint             # eslint
pnpm typecheck        # next typegen && tsc --noEmit
pnpm test             # vitest; DB tests use their own database (see below), never the dev one
pnpm test:e2e         # playwright, Chromium at 360 px: builds and starts the app on port 3100 against dishrank_test
pnpm format           # prettier (docs/ and seed/ are excluded)
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # seed cities, areas, dish taxonomy from seed/*.json (Phase 1)
pnpm db:studio        # prisma studio
pnpm overture:sync -- --city=islamabad|rawalpindi|all [--release=latest] [--margin-km=5]   # stage Overture places for /admin/import
pnpm dev:demo [-- --undo]                                     # local demo data (see below)
pnpm menu:parse  -- --upload=<menuUploadId>                   # Phase 5
pnpm rankings:recompute                                       # the nightly recompute, now (writes a JobRun)
```

Tests never touch the dev database: `pnpm test` creates `dishrank_test` on the same server as `DATABASE_URL`
(or uses `TEST_DATABASE_URL`), applies the migrations and seeds it, and test files that write empty its app
tables. Any database whose name does not end in `_test` is refused (`tests/setup/test-database.ts`).
`pnpm test:e2e` uses the same test database: `tests/e2e/setup/prepare.ts` migrates it, empties it and creates
a restaurant, a Pizza list with one ranked restaurant, a diner and a real Better Auth session; the specs set
that session's signed cookie (no sign-in bypass in the app). It runs `next build` + `next start` on port 3100 (it writes `.next`, never `.next/dev`, so
a running `pnpm dev` is fine).

Demo data for trying the rating flow before any candidate is reviewed (needs `pnpm overture:sync -- --city=islamabad`
first): `pnpm dev:demo` creates 30 restaurants from the most confident Overture candidates in F-7, F-6,
Blue Area and G-9 (names end in "(demo)"), 13 demo users (`@dev-demo.invalid`, one on the panel), about 120
ratings and one review item of each Phase 3 kind. Sign in with your own Google account to rate, see `/me`,
or (as ADMIN) turn the panel on for yourself on `/admin/users` and work through `/admin/review`.
With demo data, ranking pages such as `/islamabad/best-chicken-karahi` show ranked restaurants and "Not enough
votes yet" (Islamabad is not launched, so the early-ranking thresholds apply); `/islamabad` lists the dishes.
`pnpm rankings:recompute` runs the nightly job by hand (trust, city averages, decay, stale rows, ranks,
Sunday snapshot); pages run under `pnpm dev` show its results at once, a production build at its hourly
refresh. As ADMIN, `/admin/rankings` shows the last runs, "Recompute now" and the city launch dates. The cron
route needs the secret: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/recompute-rankings`.
`pnpm dev:demo -- --undo` removes all of it, also restaurants or dishes created from demo suggestions, and
puts the candidates back to NEW. It refuses `NODE_ENV=production`, Vercel, and any database whose URL is not localhost or a local socket
(it checks the URLs the database client uses, and the client never falls back to another server; a port
forward from localhost to another server cannot be told apart, so do not run it through one). If a demo restaurant was merged with a real one, undo removes nothing
and names the merge: the two are mixed, so remove that demo data by hand.

CI (`.github/workflows/ci.yml`) runs on pull requests and pushes to `main`: Node from `.nvmrc`, `pnpm install`,
a `postgres:17` service container, `prisma migrate deploy`, lint, typecheck and test.

## 2. Read order (for you, 30 minutes)

1. `CLAUDE.md` — rules Claude Code must follow
2. `docs/01-PRODUCT-SPEC.md` — scope, screens, success metrics
3. `docs/02-ARCHITECTURE.md` — diagrams, directory structure, ADRs
4. `docs/03-DATA-MODEL.md` — ERD + full Prisma schema
5. `docs/04-RANKING.md` — the score, eligibility, abuse rules
6. `docs/05-DISH-TAXONOMY.md` — dish list rules + matching pipeline
7. `docs/06-API-SPEC.md` — endpoints, rate limits
8. `docs/07-DATA-PIPELINES.md` — how restaurants/dishes get in (Overture candidates reviewed by an admin, menu photos, owners)
9. `docs/08-IMPLEMENTATION-PLAN.md` — phases with acceptance criteria
10. `docs/09-CLAUDE-CODE-PROMPTS.md` — **the prompts to paste, in order**
11. `docs/10-DEPLOYMENT.md` — accounts, env vars, crons, costs
12. `docs/11-REVIEW-CHECKLIST.md` — tick after every phase

## 3. Build

Paste Prompt 0 from `docs/09`, answer its questions, then Prompts 1–7 one phase at a time.
Run the acceptance checks after each phase. Use the Fix prompt for bugs and the Audit prompt before launch.

## 4. Files

```
CLAUDE.md
README.md
docs/
  01-PRODUCT-SPEC.md 02-ARCHITECTURE.md 03-DATA-MODEL.md 04-RANKING.md 05-DISH-TAXONOMY.md
  06-API-SPEC.md 07-DATA-PIPELINES.md 08-IMPLEMENTATION-PLAN.md 09-CLAUDE-CODE-PROMPTS.md
  10-DEPLOYMENT.md 11-REVIEW-CHECKLIST.md OPEN-QUESTIONS.md KICKOFF-REVIEW.md
  diagrams/*.mmd   (Mermaid sources; render with the VS Code Mermaid extension or mermaid.live)
seed/
  cities.json areas.json dish-categories.json dishes.json variant-tags.json meat-words.json
```

## 5. When something is missing

Every doc is the source of truth for its area. If the code and a doc disagree, fix the doc first
(or the code, if the doc was right), then re-run the relevant phase prompt with the Fix template.
Log decisions in `docs/OPEN-QUESTIONS.md`.
