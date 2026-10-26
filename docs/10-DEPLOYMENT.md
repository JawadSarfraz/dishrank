# 10 — Deployment and environments

The step-by-step for the first deploy is `docs/DEPLOY-CHECKLIST.md`. This page explains the setup
and why it is that way. Platform facts were checked against the current Supabase, Vercel, Google and
Prisma 7 docs on 2026-10-26.

## Accounts to create (all free tiers to start)

| Service | Purpose | Notes |
|---|---|---|
| GitHub | repo + CI | the personal account `JawadSarfraz` only (repo `JawadSarfraz/dishrank`), never an office organization |
| Vercel | hosting, crons | Hobby: personal, non-commercial use only; move to Pro ($20/mo) before a public or commercial launch. Hobby crons run at most once a day, within the hour (see Crons) |
| Supabase | Postgres + Storage | One production project in **South Asia (Mumbai)**, `ap-south-1`, for the beta (Free allows 2 active projects). Free has no automatic backups and pauses a project after a week of low activity (see Supabase database) |
| Google Cloud | OAuth client (sign-in only) | Google Auth Platform. No Places API: Google Places is not used (ADR-13) |
| Overture Maps | restaurant candidates (open data) | No account or key: `pnpm overture:sync` reads the public S3 bucket from the admin's machine (DuckDB) and writes the staging table of the database `DATABASE_URL` points at. `pnpm prod:bootstrap` runs it once; run it by hand after each monthly release |
| Anthropic Console | API key for vision + matcher | Not needed for the beta: no code calls it yet (menu parsing is Phase 5). Set a monthly spend limit when it is |
| Domain | e.g. dishrank.pk / .com | Later. The beta runs on `<project>.vercel.app` |

## Environment variables (`.env.example`)

`.env.example` lists every variable with a comment; `src/env.ts` validates them. A production
server refuses to start when a required one is missing or malformed: `DATABASE_URL`, `DIRECT_URL`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`.
`next build` only warns. Where each production value comes from is in `docs/DEPLOY-CHECKLIST.md`.

| Variable | Production value |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler, port 6543, `?pgbouncer=true`, **no** `sslmode` |
| `DIRECT_URL` | Supabase session pooler, port 5432, `?sslmode=require` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`; changing it later signs everyone out |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL` | the production origin, e.g. `https://dishrank.vercel.app` (no path, no trailing slash) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the Google OAuth web client |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `ADMIN_EMAIL` | the owner's Gmail: that account becomes ADMIN on its first sign-in |
| `SITE_MODE` | `beta` (also the production default while unset), `live` at launch |
| `BETA_ALLOWED_EMAILS` | the panel's Gmail addresses, comma-separated (beta only) |
| `OPERATOR_NAME`, `CONTACT_EMAIL` | shown on /privacy and /terms |
| `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` | Supabase Storage → S3 (see Photo storage) |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (a Vercel build setting, see Vercel) |
| not needed yet | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MENUS_BUCKET`, `ANTHROPIC_*` (Phase 5); `SUPABASE_DISH_PHOTOS_BUCKET` defaults to `dish-photos` |
| never set | `NODE_ENV` (Vercel sets it; `NODE_ENV=production` during install would skip the devDependencies the build needs) |

## Supabase database

**Connection strings.** Copy them from the project's **Connect** button (Connection string, then
Transaction pooler and Session pooler); do not type the host. The pooler host is
`aws-<n>-ap-south-1.pooler.supabase.com`, where `<n>` is a cluster number (Mumbai has both `aws-0`
and `aws-1`), and the user is `postgres.<project-ref>` (without `.<ref>` the pooler answers "Tenant
or user not found"). Put the database password in place of `[YOUR-PASSWORD]`, percent-encoding
reserved characters (`@ : / ? # & %` and spaces). Then:

- `DATABASE_URL` = **transaction pooler** (port 6543) + `?pgbouncer=true`. The app's runtime
  connection (`src/server/db.ts`, @prisma/adapter-pg): many short serverless connections. The flag
  is a no-op with Prisma 7's driver adapter (node-postgres sends unnamed statements, which
  transaction pooling allows); it stays to match the Supabase and Prisma guides. Never enable the
  adapter's `statementNameGenerator`: named statements break transaction pooling.
- `DIRECT_URL` = **session pooler** (port 5432) + `?sslmode=require`. Read only by the Prisma CLI
  (`prisma migrate deploy`, in the Vercel build and in `pnpm prod:bootstrap`), which needs one
  session-mode connection for its advisory lock and prepared statements; the transaction pooler
  breaks migrations. The direct host `db.<ref>.supabase.co` is IPv6-only on Free (IPv4 is a paid
  add-on) and Vercel connects over IPv4 only, so the session pooler is the way in.
- The seed (`prisma db seed`) and `pnpm overture:sync` connect through `src/server/db.ts`, i.e.
  `DATABASE_URL`.

**TLS.** Supabase accepts unencrypted connections unless "Enforce SSL" is on, and node-postgres
connects unencrypted unless told otherwise. `sslmode=require` in `DATABASE_URL` does not help: pg 8
treats it as verify-full against Node's CA list, which lacks Supabase's private root, and the
connection fails (`SELF_SIGNED_CERT_IN_CHAIN`, through Prisma sometimes shown as "P1010: User was
denied access"). So for a Supabase host the app verifies the server itself against the Supabase Root
2021 CA (`src/server/db-ssl.ts`: chain and host name, checked against the Mumbai poolers on
2026-10-26), and `src/env.ts` refuses a Supabase `DATABASE_URL` that carries any `sslmode` (a URL
setting would replace the app's). The Prisma CLI has its own TLS stack: with `sslmode=require` it
always encrypts but does not verify the certificate. Once the site works, turn on Database Settings
→ SSL Configuration → **Enforce SSL on incoming connections** (a short database restart); every
DishRank connection already uses TLS.

**Data API off.** Supabase serves the `public` schema over its REST Data API to anyone holding the
project's anon key, and DishRank's tables have no row-level security (the app reaches Postgres only
through Prisma). Turn the Data API off in the project settings. Storage's S3 protocol does not
depend on it.

**Pool size.** Free projects allow 200 pooler clients; `src/server/db.ts` keeps at most 3
connections per function instance (`max: 3`, 5 s connect timeout).

**Pausing.** A Free project pauses after a week of low database activity; Supabase emails about a
week before. The nightly recompute writes rows, which probably counts as activity, but the docs do
not promise it: open the dashboard if the warning arrives. Upgrade to Pro before a wider launch
(also for daily backups).

## Photo storage (Phase 3)

1. Storage → Files → New bucket: `dish-photos`, **Public bucket** on, Restrict file size 5 MB,
   allowed MIME types `image/jpeg, image/webp`, Object versioning off (with versioning a delete
   keeps old versions). `menus`: Public off (Phase 5). The bucket limits check the declared
   `Content-Type`, so the server also checks each object (HEAD: exists, ≤ 5 MB, JPEG or WebP) before
   a rating accepts it.
2. Storage → Configuration → S3: turn on **S3 protocol connection**. Copy **Endpoint** into
   `SUPABASE_S3_ENDPOINT` (exactly as shown; expected `https://<ref>.storage.supabase.co/storage/v1/s3`,
   and a presigned URL is signed for that host) and **Region** into `SUPABASE_S3_REGION`
   (`ap-south-1`). Under Access keys, **New access key**: copy the key id and the secret at once,
   the secret is shown only once. The key acts as the service role (full access to every bucket,
   bypassing RLS): server only, never a `NEXT_PUBLIC_` variable.
3. Check: on `/rate`, the score step's **Add details (optional)** section has a **Photo** field; an
   upload URL expires after 10 minutes.

When no rating uses a photo any more (its rating was deleted, its photo replaced or removed, or
the rating merged away), the app deletes the file after the database change (presigned S3
`DELETE`; a failure is logged with the path for a manual clean-up, and Hobby keeps logs only an
hour: a failed delete leaves the file until someone removes it in the bucket). An edit that sends
no photo keeps the earlier one; only an explicit removal deletes it. On Free (Basic CDN, no cache
purge) a deleted public photo can still be served from a cache for a while; Pro's Smart CDN purges
it within a minute. Photos uploaded but never attached to a rating stay in the bucket (no clean-up
job yet). Free includes 1 GB of storage and 5 GB + 5 GB (cached) egress a month.

Production should not launch without photo uploads (DECISION-PENDING, docs/OPEN-QUESTIONS.md):
without them no non-panel rater can reach the 1.0 or 1.2 trust rows of docs/04. `src/env.ts` keeps
the S3 variables optional so local, preview and CI runs work without storage.

## Vercel (`vercel.json`)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm vercel-build",
  "regions": ["bom1"],
  "fluid": true,
  "git": { "deploymentEnabled": { "**": false, "main": true } },
  "crons": [{ "path": "/api/cron/recompute-rankings", "schedule": "0 21 * * *" }]
}
```

- **buildCommand** → `scripts/vercel-build.ts`: on production deployments (`VERCEL_ENV=production`)
  `prisma migrate deploy` through `DIRECT_URL`, then `next build`; other builds never migrate. A
  migration runs before the new code is live, and a failed build leaves the old deployment serving,
  so migrations must stay backwards compatible (add, then use, then remove). `prisma generate` runs
  in `postinstall` and needs no database.
- **regions** `bom1` (Mumbai) puts the functions next to the Supabase database; the default `iad1`
  would add a US–India round trip to every query. Hobby may pick any single region.
- **fluid**: Fluid compute (on by default for new projects): Hobby functions run up to 300 s, the
  `maxDuration` the cron routes and /admin/rankings ask for.
- **git.deploymentEnabled**: only `main` deploys. Previews are off, because a preview would run
  with production's variables or none at all (a production-mode server without them refuses to
  start). Give Preview its own database before turning them on.
- **crons**: see Crons.
- **Node.js** 24 comes from `package.json` `engines` (`24.x`), which overrides the project setting.
- **pnpm 12**: set `ENABLE_EXPERIMENTAL_COREPACK=1` (Production) so the install uses
  `packageManager` `pnpm@12.14.0`; without it Vercel picks a pnpm from the lockfile, and pnpm 12
  support there is not settled (vercel/vercel#17434). Check the first build log for "pnpm 12.14.0"
  and Node 24.
- **Variables**: scope every variable to **Production**. Mark passwords, keys and tokens as
  **Secret** (write-only, redacted in logs) and the rest as Config. A change applies only to new
  deployments: redeploy after every change (`SITE_MODE` and `NEXT_PUBLIC_*` are read at build time).
- **Deployment Protection**: keep the default Standard protection. It protects preview and
  per-deployment URLs, not the production domain, which the panel uses. Google sign-in works only on
  the production domain (`BETTER_AUTH_URL`): Better Auth trusts that one origin, and Google accepts
  only the registered redirect URI.
- **Logs**: Hobby keeps runtime logs for an hour. The nightly job's record is the JobRun list on
  /admin/rankings.

## Site mode and beta access

`SITE_MODE=beta` (the production default while unset): `noindex, nofollow` on every page and an
`X-Robots-Tag` header on every response, robots.txt `Disallow: /`, an empty sitemap and a small
"Beta" label. `live` turns all of that off. It is read at build time: change it, then redeploy.
One limit: a crawler that obeys `Disallow: /` never fetches a page, so it never sees its noindex
either; if a beta link is posted somewhere public, Google may still list the bare address (no
title or text). Keep beta links in private chats.

Google does not keep a "Testing" app private when it asks only for name, e-mail and profile
(`openid email profile`, which is all DishRank asks for): any Google account can sign in, without
a warning, test user or not. So in beta the app itself admits only the Gmail addresses in
`BETA_ALLOWED_EMAILS` and `ADMIN_EMAIL`, with an e-mail Google has verified, when they first sign
in; anyone else lands on /sign-in with
"DishRank is a private beta and this Google account is not invited yet". The list is checked when an
account is created: accounts that already exist keep working (there is no remove button yet). In
`live` everyone can sign up.

## Environments

| Env | DB | Notes |
|---|---|---|
| local | Homebrew PostgreSQL 17 with `pg_trgm` and `unaccent` | `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev:demo` (demo data; `-- --undo` removes it; refuses any database not on this machine); no Docker. `SITE_MODE` defaults to `live` |
| CI (GitHub Actions) | `postgres` service container, same major version | `prisma migrate deploy`, seed, lint, typecheck, test |
| preview (Vercel) | none | off (`git.deploymentEnabled`) until Preview has its own database; never point previews at production data |
| production | Supabase, Mumbai | migrations in the Vercel build (production only); a new database is prepared with `pnpm prod:bootstrap` |

## Preparing a new production database

`pnpm prod:bootstrap` (from the owner's machine) runs `prisma migrate deploy`, the taxonomy seed
(cities, areas, dishes and their spellings) and `overture:sync --city=all`, against the
`DATABASE_URL` and `DIRECT_URL` exported in the shell. It never reads `.env` (its child processes
load an empty dotenv file), shows where both URLs point (host, port, database, user and Supabase project; never the
password) and runs nothing until the host, and for Supabase the project ref, are typed back. One
pooler host serves every Supabase project of a region, so the ref is what names the project; the
script refuses two URLs that point at different projects or databases, and URL parameters that
would connect elsewhere (`user=`, `port=`, `host=` and the like). It never creates demo or fake
data, and every step is safe to run again.

## Crons (`vercel.json`)

`0 21 * * *` is in UTC: 21:00 UTC = 02:00 PKT (Pakistan has no daylight saving). On Hobby a daily
cron fires somewhere within that hour, so 02:00–02:59 PKT; Pro keeps the minute. Vercel sends the
request (GET) with `Authorization: Bearer $CRON_SECRET` when the variable is set, and the endpoints
refuse every request when it is not. Vercel runs crons only for production deployments, does not
retry a failed run and may, rarely, skip or repeat one; the job is idempotent and refuses to run
twice at once. `mark-stale` is not scheduled because recompute already marks stale rows; call it by
hand if needed. To run the recompute now: "Recompute now" on /admin/rankings.

## Release steps

1. PR → CI green → merge to `main`.
2. Vercel builds `main` with `pnpm vercel-build` (migrations, then `next build`).
3. Smoke test: `/`, one ranking page, `/rate` sign-in, `/admin` role check.
4. Tag `vX.Y.Z`.

## Backups and safety

- Supabase daily backups (Pro) or weekly `pg_dump` via a GitHub Action to a private bucket (Free has none).
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
