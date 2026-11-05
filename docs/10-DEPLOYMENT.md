# 10 — Deployment and environments

The step-by-step for the first deploy is `docs/DEPLOY-CHECKLIST.md`. This page explains the setup
and why it is that way. Platform facts were checked against the current Supabase, Vercel, Google and
Prisma 7 docs on 2026-10-26.

## Accounts to create (all free tiers to start)

| Service | Purpose | Notes |
|---|---|---|
| GitHub | repo + CI + daily database backup (Actions artifacts, see Backups) | the personal account `JawadSarfraz` only (repo `JawadSarfraz/dishrank`), never an office organization |
| Vercel | hosting, crons | Hobby: personal, non-commercial use only; move to Pro ($20/mo) before a public or commercial launch. Hobby crons run at most once a day, within the hour (see Crons) |
| Supabase | Postgres + Storage | One production project in **South Asia (Mumbai)**, `ap-south-1`, for the beta (Free allows 2 active projects). Free has no automatic backups (a GitHub Actions workflow takes one daily, see Backups and restore) and pauses a project after a week of low activity (see Supabase database) |
| Google Cloud | OAuth client (sign-in only) | Google Auth Platform. No Places API: Google Places is not used (ADR-13) |
| Overture Maps | restaurant candidates (open data) | No account or key: `pnpm overture:sync` reads the public S3 bucket from the admin's machine (DuckDB) and writes the staging table of the database `DATABASE_URL` points at. `pnpm prod:bootstrap` runs it once; run it by hand after each monthly release |
| Anthropic Console | API key for vision + matcher | Not needed for the beta: no code calls it yet (menu parsing is Phase 5). Set a monthly spend limit when it is |
| Domain | e.g. dishrank.pk / .com | Later. The beta runs on `<project>.vercel.app` |

## Environment variables (`.env.example`)

`.env.example` lists every variable with a comment; `src/env.ts` validates them. A production
server refuses to start when a required one is missing or malformed: `DATABASE_URL`, `DIRECT_URL`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`,
`IP_HASH_SECRET` (Phase 6).
`next build` only warns, but the Vercel build (`scripts/vercel-build.ts`) checks the same schema
(`src/env-schema.ts`) before anything else and stops, naming only the missing or invalid variables
(never values), so such a deployment never goes live: add a new variable in Vercel before pushing
the code that needs it. Where each production value comes from is in `docs/DEPLOY-CHECKLIST.md`.

| Variable | Production value |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler, port 6543, `?pgbouncer=true`, **no** `sslmode` |
| `DIRECT_URL` | Supabase session pooler, port 5432, `?sslmode=require` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`; changing it later signs everyone out |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL` | the production origin, e.g. `https://dishrank.vercel.app` (no path, no trailing slash) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the Google OAuth web client |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `IP_HASH_SECRET` | `openssl rand -hex 32`; keys the hash of client IPs in rate-limit keys (never the raw IP). Changing it only resets the per-IP limits |
| `ADMIN_EMAIL` | the owner's Gmail: that account becomes ADMIN on its first sign-in |
| `SITE_MODE` | `beta` (also the production default while unset), `live` at launch |
| `BETA_ALLOWED_EMAILS` | the panel's Gmail addresses, comma-separated (beta only) |
| `OPERATOR_NAME`, `CONTACT_EMAIL` | shown on /privacy and /terms |
| `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` | Supabase Storage → S3 (see Photo storage) |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (a Vercel build setting, see Vercel) |
| `ANTHROPIC_API_KEY` | a Claude API key (Secret); without it menu photos are kept but not read, and the matcher skips its LLM step |
| `ANTHROPIC_VISION_MODEL` | the model that reads menu photos, e.g. `claude-sonnet-5-5` (Phase 5; parsing runs only with the key and this) |
| `ANTHROPIC_MATCH_MODEL` | a small model for the matcher's last step, e.g. `claude-haiku-5-5` |
| not needed yet | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; `SUPABASE_DISH_PHOTOS_BUCKET` and `SUPABASE_MENUS_BUCKET` default to `dish-photos` and `menus` |
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
Kahan Khayen connection already uses TLS.

**Data API off.** Supabase serves the `public` schema over its REST Data API to anyone holding the
project's anon key, and Kahan Khayen's tables have no row-level security (the app reaches Postgres only
through Prisma). Turn the Data API off in the project settings. Storage's S3 protocol does not
depend on it.

**Pool size.** Free projects allow 200 pooler clients; `src/server/db.ts` keeps at most 3
connections per function instance (`max: 3`, 5 s connect timeout).

**Pausing.** A Free project pauses after a week of low database activity; Supabase emails about a
week before. The nightly recompute writes rows, which probably counts as activity, but the docs do
not promise it: open the dashboard if the warning arrives. Upgrade to Pro before a wider launch
(also for daily backups).

## Photo storage (Phase 3, menus Phase 5)

1. Storage → Files → New bucket: `dish-photos`, **Public bucket** on, Restrict file size 5 MB,
   allowed MIME types `image/jpeg, image/webp`, Object versioning off (with versioning a delete
   keeps old versions). `menus` (Phase 5): **Public bucket off**, Restrict file size 5 MB, allowed
   MIME types `image/jpeg, image/webp`, versioning off; the same S3 key reads and writes it, the
   server downloads a photo to parse it and admins see one through a 10-minute GET link. The bucket limits check the declared
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
it within a minute. Uploads that no rating and no menu upload has used for 24 hours are
deleted every night (after the menu parses, Phase 6), file and `Upload` row; photos signed
before Phase 6 and never attached have no row and stay until removed by hand. Free includes 1 GB of storage and 5 GB + 5 GB (cached) egress a month.

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
  "crons": [
    { "path": "/api/cron/parse-menus", "schedule": "0 20 * * *" },
    { "path": "/api/cron/recompute-rankings", "schedule": "0 21 * * *" }
  ]
}
```

- **buildCommand** → `scripts/vercel-build.ts`: first the environment check (the variables a
  production server needs, with the server's own schema; a missing or invalid one stops the build
  with the names only, since 2026-11-04, when a deployment without the new `IP_HASH_SECRET` went
  live and every request failed for two hours), then `prisma generate`, then on production
  deployments (`VERCEL_ENV=production`) `prisma migrate deploy` through `DIRECT_URL`, then `next
  build`; other builds never migrate. The Prisma client (`src/generated`, git-ignored) is generated in the build
  itself: the `postinstall` hook is not guaranteed to run on Vercel, and without the client `next
  build` fails with "Module not found: Can't resolve '@/generated/prisma/…'" (2026-11-04). A
  migration runs before the new code is live, and a failed build leaves the old deployment serving,
  so migrations must stay backwards compatible (add, then use, then remove).
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
(`openid email profile`, which is all Kahan Khayen asks for): any Google account can sign in, without
a warning, test user or not. So in beta the app itself admits only the Gmail addresses in
`BETA_ALLOWED_EMAILS` and `ADMIN_EMAIL`, with an e-mail Google has verified, when they first sign
in; anyone else lands on /sign-in with
"Kahan Khayen is a private beta and this Google account is not invited yet". The list is checked when an
account is created: accounts that already exist keep working (there is no remove button yet). In
`live` everyone can sign up.

## Environments

| Env | DB | Notes |
|---|---|---|
| local | Homebrew PostgreSQL 17 with `pg_trgm` and `unaccent` | `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev:demo` (demo data; `-- --undo` removes it; refuses any database not on this machine); no Docker. `SITE_MODE` defaults to `live` |
| CI (GitHub Actions) | `postgres` service containers, same major version | job `check`: `prisma migrate deploy`, seed, lint, typecheck, test. Job `vercel-build`: the Vercel production build on a clean Linux checkout (no `.env`, no dependency cache, dummy values, an empty throwaway database, `src/generated` removed after the install) |
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

## Dependency audit

`pnpm audit` must show no high or critical advisory (docs/11). On 2026-11-04 it showed one high
(body-parser) and one moderate (minimatch), both pulled in only by the `shadcn` CLI's tooling;
`overrides` in `pnpm-workspace.yaml` pins their patched versions (drop each entry once the parent
ships it). One low remains (deepmerge, no patched version, also via `shadcn`).

## Crons (`vercel.json`)

`0 21 * * *` is in UTC: 21:00 UTC = 02:00 PKT (Pakistan has no daylight saving). On Hobby a daily
cron fires somewhere within that hour, so 02:00–02:59 PKT; Pro keeps the minute. `parse-menus`
(`0 20 * * *`, 01:00–01:59 PKT) reads up to 20 waiting menu photos first, so the recompute sees the
dish rows they verified; it answers ok and does nothing without the Anthropic variables. Hobby
allows only daily crons; two is within every published Hobby limit. Vercel sends the
request (GET) with `Authorization: Bearer $CRON_SECRET` when the variable is set, and the endpoints
refuse every request when it is not. Vercel runs crons only for production deployments, does not
retry a failed run and may, rarely, skip or repeat one; the job is idempotent and refuses to run
twice at once. `mark-stale` is not scheduled because recompute already marks stale rows; call it by
hand if needed. To run the recompute now: "Recompute now" on /admin/rankings.

## Release steps

1. New environment variables go into Vercel (Production) before the push that needs them.
2. PR → CI green → merge to `main`.
3. Vercel builds `main` with `pnpm vercel-build` (environment check, Prisma client, migrations, then `next build`); CI's `vercel-build` job runs the same build first.
4. Smoke test: `/`, one ranking page, `/rate` sign-in, `/admin` role check.
5. Tag `vX.Y.Z`.

## Uptime monitor

`GET https://<domain>/api/health` answers `200 {"ok":true}` when the database answers a trivial
query within 3 s, otherwise `503 {"ok":false}`; the reason is only in the log (`health.fail`, with
`timeout` or the database error). It needs no sign-in, is never cached, records no analytics event
and allows each IP 12 checks a minute, far above a monitor's one. Point a free uptime monitor at it
(for example UptimeRobot or Better Stack): an HTTP(S) check with GET (HEAD works too) every 1 to 5
minutes, alerting by e-mail when the status is not 200. It catches a deployment that fails every
request, a paused or unreachable Supabase project and a broken `DATABASE_URL`; it does not check
pages, sign-in or the crons (their record is the JobRun list on /admin/rankings).

## Backups and restore

Supabase Free has no automatic backups, so the GitHub Actions workflow
`.github/workflows/db-backup.yml` takes one every day at 22:00 UTC (03:00 PKT), and on demand. The
start of an hour is GitHub's busiest time: a scheduled run may start late, and under heavy load
GitHub may drop it, which sends no e-mail; a cron a few minutes past the hour (`13 22 * * *`) makes
that less likely. It runs `scripts/db-backup.sh`:

1. `pg_dump` 17 (the server's major version, from the PostgreSQL apt repository) through the
   session pooler (`PROD_DIRECT_URL`; the transaction pooler cannot serve a dump): the `public`
   schema, which holds every Kahan Khayen table, plus the `pg_trgm` and `unaccent` extensions, in
   custom format. Not in it: Supabase's own schemas (`auth`, `storage` and the like, which
   Kahan Khayen does not use) and the photo files in Storage. The connection verifies the server's
   certificate chain and host name against Supabase's root CA (`config/supabase-root-2021.crt`,
   the same certificate the app verifies with; libpq `sslmode=verify-full`), because
   `sslmode=require` alone would encrypt without checking who answers (audit 2026-11). An
   `sslmode` inside `PROD_DIRECT_URL` is ignored. If a run ever fails on the certificate check,
   `BACKUP_SSLMODE=require` in the workflow restores the old behaviour while the cause is found.
2. `pg_restore --list` must read the dump and find the data of the core tables (`User`,
   `Restaurant`, `Rating` and others).
3. gpg encrypts it with `BACKUP_PASSPHRASE` (symmetric AES-256, the classic OpenPGP format every gpg
   2.x reads), decrypts the result again and compares it with the dump.
4. A file under 150 KB fails the run: an empty Kahan Khayen database dumps to about 90 KB, the dev
   database with its Overture candidates to 390 KB (2026-11-04). Raise or lower it with
   `BACKUP_MIN_BYTES` in the workflow if ever needed.
5. The encrypted file is kept as a workflow artifact for 30 days.

Any failure fails the run, and GitHub e-mails you: a scheduled run notifies whoever last changed
the workflow's `cron` line, so check GitHub → Settings → Notifications → Actions (e-mail, failed
workflows only). Neither the URL nor the passphrase is printed: GitHub hides secrets in logs, and
the job also hides the URL's host, user and password in case an error message names one. In a
public repository anyone signed in to GitHub can download a run's artifacts, so the encryption is
what keeps the data private: keep the passphrase in your password manager, and remember that
without it no backup can be read. GitHub turns off scheduled workflows in a public repository after
60 days without activity; Actions → Database backup → Enable workflow turns it on again. Artifacts count against the account's Actions storage (500 MB on a free private
repository): about 12 MB for 30 daily backups of today's size.

**Secrets** (GitHub → the repository → Settings → Secrets and variables → Actions → New repository
secret):

| Name | Value |
|---|---|
| `PROD_DIRECT_URL` | the same value as Vercel's `DIRECT_URL`: the session pooler, port 5432, `?sslmode=require` |
| `BACKUP_PASSPHRASE` | `openssl rand -base64 32`, a new value: save it in your password manager first |

**Run one by hand**: Actions → Database backup → Run workflow → branch `main` → Run workflow. After
a couple of minutes the run has a green tick and, under Artifacts, `dishrank-<date>T<time>Z`.

**Restore into a scratch database** on your laptop (Homebrew PostgreSQL 17 on port 5433;
`brew install gnupg` once). Tested on 2026-11-04 with a backup of the local dev database: every
table's row count, the extensions, the indexes and `prisma migrate status` matched.

```
# 1. Download: the run's page → Artifacts → dishrank-<date>T<time>Z (a zip), then unzip it
cd ~/Downloads && unzip dishrank-<date>T<time>Z.zip
# 2. Decrypt; gpg asks for BACKUP_PASSPHRASE
gpg --output dishrank.dump --decrypt dishrank-<date>T<time>Z.dump.gpg
# 3. A new scratch database. The backup brings its own public schema, so drop the new, empty one
#    (Postgres refuses this on a database that has tables in it)
/opt/homebrew/opt/postgresql@17/bin/createdb -p 5433 dishrank_restore
/opt/homebrew/opt/postgresql@17/bin/psql -p 5433 -d dishrank_restore -c 'drop schema public'
# 4. Restore tables, data, indexes and the two extensions
/opt/homebrew/opt/postgresql@17/bin/pg_restore -p 5433 -d dishrank_restore \
  --no-owner --no-privileges --exit-on-error dishrank.dump
# 5. Look at it
/opt/homebrew/opt/postgresql@17/bin/psql -p 5433 -d dishrank_restore \
  -c 'select count(*) from "Restaurant"' -c 'select count(*) from "Rating"'
# 6. Clean up: the scratch database and the decrypted file (it holds every user's e-mail address)
/opt/homebrew/opt/postgresql@17/bin/dropdb -p 5433 dishrank_restore
rm dishrank.dump
```

If step 4 stops at `CREATE EXTENSION` with `schema "extensions" does not exist` (production keeps
the extensions in Supabase's `extensions` schema), drop and create the scratch database again, run
`psql -p 5433 -d dishrank_restore -c 'drop schema public' -c 'create schema extensions'`, and
restore again. Putting a backup back into production is a separate decision (a new Supabase
project, or the same one after a mistake): restore it into a scratch database first and check it.

**Safety**

- Admin "merge" and "remove" actions are soft (status changes, history kept). Hard deletes for a user's own requests: deleting a rating, and "Delete my account" on /me (Phase 6; what goes and what stays: docs/06, /privacy).
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
