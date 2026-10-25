# 10 — Deployment and environments

## Accounts to create (all free tiers to start)

| Service | Purpose | Notes |
|---|---|---|
| GitHub | repo + CI | private repo |
| Vercel | hosting, crons, analytics | Hobby is for non-commercial use; move to Pro ($20/mo) the month you charge a restaurant. Hobby crons run at most once per day — our schedule fits. |
| Supabase | Postgres + Storage | Two projects: preview and production (Free allows 2). Region: ap-south-1 (Mumbai) for lowest latency from Pakistan. Free project pauses after ~1 week of inactivity; the daily cron keeps it alive, but a paused DB on launch day is a risk — upgrade to Pro ($25/mo) before launch marketing. |
| Google Cloud | OAuth client (sign-in only) | Restrict OAuth to your domains. No Places API key: Google Places is not used (ADR-13). |
| Overture Maps | restaurant candidates (open data) | No account or key: `pnpm overture:sync` reads the public S3 bucket from the admin's machine (DuckDB, a few MB per release) and writes the staging table of the database `DATABASE_URL` points at. Run it against production by hand after each monthly release. |
| Anthropic Console | API key for vision + matcher | Set a monthly spend limit (e.g. $20). |
| Domain | e.g. dishrank.pk / .com | Point to Vercel; set `NEXT_PUBLIC_SITE_URL`. |

## Environment variables (`.env.example`)

```
# Database (Supabase). Local dev (Homebrew PostgreSQL 17 on port 5433) uses the same value for both:
#   DATABASE_URL=postgresql://jawad@localhost:5433/dishrank
#   DIRECT_URL=postgresql://jawad@localhost:5433/dishrank
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true   # runtime: Supavisor transaction mode, used by @prisma/adapter-pg (pool size is set in src/server/db.ts; connection_limit is ignored by the driver adapter)
DIRECT_URL=postgresql://...pooler.supabase.com:5432/postgres                     # Prisma CLI (migrate, seed) via prisma.config.ts: Supavisor session mode, because the free-plan direct host is IPv6-only and Vercel builds are IPv4

# Better Auth
BETTER_AUTH_SECRET=               # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000   # public base URL of this deployment
GOOGLE_CLIENT_ID=                 # Google OAuth client; redirect URI <BETTER_AUTH_URL>/api/auth/callback/google
GOOGLE_CLIENT_SECRET=

# Supabase Storage
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=        # server only, never exposed
SUPABASE_DISH_PHOTOS_BUCKET=dish-photos  # public read; random cuid file names; writes only via signed upload URLs
SUPABASE_MENUS_BUCKET=menus              # private; menu photos, read server-side with the service role key

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_VISION_MODEL=            # set to a current Claude model id
ANTHROPIC_MATCH_MODEL=             # a small/fast Claude model id, e.g. claude-haiku-5-5; the LLM step runs only when this and the key are set

# App
NEXT_PUBLIC_SITE_URL=https://dishrank.pk
CRON_SECRET=                       # openssl rand -hex 32
ADMIN_EMAIL=                       # first admin: a Better Auth user-create hook gives this email role ADMIN on first sign-in
# NODE_ENV is set by Next.js itself; do not put it in .env
```

## Environments

| Env | DB | Notes |
|---|---|---|
| local | Homebrew PostgreSQL, same major version as the Supabase projects, with `pg_trgm` and `unaccent`; storage uses the preview Supabase project | `pnpm db:migrate`, `pnpm db:seed`, `scripts/dev-fake-ratings.ts`; no Docker |
| CI (GitHub Actions) | `postgres` service container, same major version (the image ships `pg_trgm` and `unaccent`) | `prisma migrate deploy`, then lint, typecheck, test |
| preview (Vercel) | the preview Supabase project (also serves local storage) | Never point previews at prod data |
| production | Supabase prod | Migrations run from CI/CD step `prisma migrate deploy` before build |

## Crons (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/cron/recompute-rankings", "schedule": "0 21 * * *" }
  ]
}
```
(UTC. 21:00 UTC = 02:00 PKT.) Vercel sends the request with `Authorization: Bearer $CRON_SECRET` when the env var is set, and the endpoints refuse every request when it is not. `mark-stale` is not scheduled because recompute already marks stale rows; call it by hand if needed. Vercel runs cron jobs only for production deployments.

## Release steps

1. PR → CI green → merge to `main`.
2. Vercel build runs `prisma generate && prisma migrate deploy && next build` (set as the build command).
3. Smoke test: `/`, one ranking page, `/rate` sign-in, `/admin` role check.
4. Tag `vX.Y.Z`.

## Backups and safety

- Supabase daily backups (Pro) or weekly `pg_dump` via a GitHub Action to a private bucket (free tier).
- Admin "merge" and "remove" actions are soft (status changes, history kept). Hard deletes only for GDPR-style user deletion requests.
- Keep `tmp/` out of git; menu photos are in Storage, not the repo.

## Cost estimate (first 6 months)

| Item | Monthly |
|---|---|
| Vercel Hobby → Pro at monetisation | $0 → $20 |
| Supabase Free → Pro before launch | $0 → $25 |
| Overture Maps (open data, read once a month) | $0 |
| Anthropic (≈300 menus + matcher calls) | $5–15 |
| Domain | ~$1–2 |
| **Total** | **$5–60** |
