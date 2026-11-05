# Deploy checklist: Kahan Khayen

Production runs on https://kahankhayen.com. **Going public? Jump to [Go live](#go-live).** The steps
below it set up a new environment from nothing.

Do the steps in order. Keep a password manager open: several secrets are shown only once.
`<domain>` means your production domain, `kahankhayen.com` today (on a new project, from step 5).
Why things are set up this way: `docs/10-DEPLOYMENT.md`.

## Go live

What is left on 2026-11-06. No new environment variable is needed for any of it. Do it in this order.

**Before the switch**

1. Push `main`. The build runs the three new migrations. When it is ready,
   `https://kahankhayen.com/api/health` shows `{"ok":true}`.
2. Check Vercel → Settings → Environment Variables: `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` are
   both `https://kahankhayen.com`, with no trailing slash. They decide the sign-in callback, canonical
   links and the invite links.
3. **Auto-list on production.** `/admin/import` → **Auto-list**. Read the dry run: the counts per city,
   area and category, why the others stay NEW, the tidied names. The numbers differ a little from your
   laptop if production's Overture release differs; refresh it first with `pnpm prod:bootstrap` if it
   is more than a month old. Then **Apply** and keep the page open until it says Done (a stopped run
   carries on when you press Apply again). Running it twice changes nothing.
4. Spot-check: `/admin/restaurants` → Listing **Auto-listed, not checked**. **Looks right** for the
   good ones; open the wrong ones and fix, hide or merge them. It does not have to be finished before
   launch: a page says "our team has not checked it yet" until you have.
5. Open a dish page on your phone: "Places to try", the area and Near me filters, and **Rate the places
   you know**. Rate two dishes you have really eaten.
6. Optional: `/admin/users` → **Panel invite links** → create one and send it to people you trust. Copy
   it when it is shown: only once.

**The switch**

7. Vercel → Environment Variables: `SITE_MODE` = `live`, then Deployments → latest → **Redeploy**
   (it is read at build time). Check: no **Beta** label; `https://kahankhayen.com/robots.txt` no longer
   says `Disallow: /`; a Gmail not on `BETA_ALLOWED_EMAILS` can sign up in a private tab.
8. Vercel → Settings → Domains → `www.kahankhayen.com`: change the redirect to `kahankhayen.com` from
   **307** to **308** (permanent).
9. **Launch date:** `/admin/rankings` → **Launch Islamabad** and **Launch Rawalpindi**. It is set once,
   so press it on the day you announce. Early rankings (fewer raters needed) go on for 60 days after it.
10. Google Auth Platform (console.cloud.google.com) → **Audience** → **Publish app**, so anyone can sign
    in without being a test user. First check **Branding**: the app name is Kahan Khayen, home page
    `https://kahankhayen.com`, privacy `/privacy`, terms `/terms`, and `kahankhayen.com` is an authorized
    domain. Sign-in asks only for name and e-mail, the basic scopes; if Google still asks for a
    verification step, follow what the console says.
11. **Google Search Console** (search.google.com/search-console) → Add property → **Domain** →
    `kahankhayen.com`, confirm with the DNS TXT record it gives you, then Sitemaps → submit
    `https://kahankhayen.com/sitemap.xml`. Only pages with real ratings are in it, so it starts short.
12. Smoke test on your phone in Chrome or Safari: the home page, a sign-in, a rating, and `/admin` shows
    **No server errors** at the bottom.

**A week later: clean up the old address**

13. Vercel → Settings → Domains → `dishrank-beta.vercel.app`: change the redirect from **307** to
    **308**.
14. Only then, in Google Auth Platform: under **Clients** remove the JavaScript origin
    `https://dishrank-beta.vercel.app` and the redirect URI
    `https://dishrank-beta.vercel.app/api/auth/callback/google`, and under **Branding** remove its
    authorized domain.

## 1. Supabase project (Mumbai)

1. supabase.com → New project. Organization: your own. Name: `dishrank`.
   Database password: generate a strong one and save it. Region: **South Asia (Mumbai)**
   (`ap-south-1`). Plan: Free. Create, and wait until the project is ready.
2. Project Settings → Data API: turn the **Data API off**. Kahan Khayen talks to Postgres directly;
   with the Data API on, the project's public anon key could read the app's tables.
3. **Connect** (top of the project page) → Connection string:
   - **Transaction pooler**: copy it, put your database password in place of `[YOUR-PASSWORD]` and
     add `?pgbouncer=true` at the end. This is `DATABASE_URL`. Do not add `sslmode`.
   - **Session pooler**: copy it, put the password in, add `?sslmode=require`. This is `DIRECT_URL`.
   - Check: both start with `postgresql://postgres.<project-ref>:` and use the same host
     `aws-…-ap-south-1.pooler.supabase.com`, ports 6543 and 5432. If the password has
     `@ : / ? # & %` or spaces, percent-encode them (for example `@` → `%40`).

## 2. Storage: bucket and S3 keys

1. Storage → Files → **New bucket**: name `dish-photos`, **Public bucket on**, Restrict file size
   **5 MB**, Allowed MIME types `image/jpeg, image/webp`, Object versioning **off**. Create.
2. New bucket `menus` (menu photos): **Public bucket off**, Restrict file size **5 MB**, Allowed
   MIME types `image/jpeg, image/webp`, Object versioning **off**. Create.
3. Storage → Configuration → **S3**: turn on **S3 protocol connection**, Save.
4. Copy **Endpoint** → `SUPABASE_S3_ENDPOINT` and **Region** (`ap-south-1`) → `SUPABASE_S3_REGION`.
5. Access keys → **New access key**, name `vercel` → Create. Copy the **Access key ID** →
   `SUPABASE_S3_ACCESS_KEY_ID` and the **Secret access key** → `SUPABASE_S3_SECRET_ACCESS_KEY`
   right away: the secret is never shown again.

## 3. Generate two secrets (on your laptop)

```
openssl rand -base64 32   # → BETTER_AUTH_SECRET
openssl rand -hex 32      # → CRON_SECRET
openssl rand -hex 32      # → IP_HASH_SECRET (a second, different value)
```

## 4. Prepare the database: `pnpm prod:bootstrap`

In the repo on your laptop (Node 24, after `pnpm install`). Paste each URL when asked: `read -rs`
keeps the password off the screen and out of your shell history.

```
read -rs 'DATABASE_URL?Paste DATABASE_URL: ' && echo && export DATABASE_URL
read -rs 'DIRECT_URL?Paste DIRECT_URL: ' && echo && export DIRECT_URL
pnpm prod:bootstrap
```

1. It shows where the URLs point (host, port, database, user and Supabase project; never the
   password) and refuses if the two URLs point at different projects. Check the project ref is the
   one in your Supabase dashboard address, then **type the host** and then **the project ref** it
   shows.
2. It runs the migrations, the taxonomy seed (cities, areas, dishes) and the Overture candidates of
   Islamabad and Rawalpindi (a few minutes: it downloads Overture data). An `[env]` warning about
   auth or cron settings is expected. It never creates demo data; if a step fails, fix the cause
   and run it again.
3. Close that terminal (or `unset DATABASE_URL DIRECT_URL`) so local commands use your `.env` again.

## 5. Vercel project from your personal GitHub

1. Push `main` to **github.com/JawadSarfraz/dishrank** (your personal account).
2. vercel.com → log in with **Continue with GitHub** while the browser is signed in to
   **JawadSarfraz**, not the office account. Plan: Hobby.
3. Add New → Project → Import Git Repository. If `dishrank` is missing: **Configure GitHub App** →
   install it on the personal account **JawadSarfraz only** → **Only select repositories** →
   `dishrank` → Save. Never install it on the office organization.
4. Import `dishrank`. Framework: Next.js (detected), Root Directory `./`. Leave the build settings
   alone: `vercel.json` sets them (build, Mumbai region, daily cron, only `main` deploys).
5. Environment Variables (in the import screen): add every row marked **now** in step 6, all
   for **Production**. Deploy. The build stops at its environment check, naming
   `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as missing: expected, they come
   in step 8, and a failed build never goes live.
6. Settings → **Domains** shows your production domain: your own (`kahankhayen.com`) once it is
   added there, else a `*.vercel.app` address. That is `<domain>`.

## 6. Environment variables (Vercel → Settings → Environment Variables)

Every variable: Environment **Production** only. Type **Secret** for passwords and keys, **Config**
for the rest. Vercel uses a change only after a redeploy.

| Name | Value | From | Type | When |
|---|---|---|---|---|
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | (makes Vercel use pnpm 12.14.0) | Config | now |
| `DATABASE_URL` | transaction pooler URL | step 1.3 | Secret | now |
| `DIRECT_URL` | session pooler URL | step 1.3 | Secret | now |
| `BETTER_AUTH_SECRET` | 44 characters | step 3 | Secret | now |
| `CRON_SECRET` | 64 hex characters | step 3 | Secret | now |
| `IP_HASH_SECRET` | 64 hex characters (not the cron one) | step 3 | Secret | now (Phase 6: before deploying it) |
| `SUPABASE_S3_ENDPOINT` | `https://<ref>.storage.supabase.co/storage/v1/s3` | step 2.4 | Config | now |
| `SUPABASE_S3_REGION` | `ap-south-1` | step 2.4 | Config | now |
| `SUPABASE_S3_ACCESS_KEY_ID` | key id | step 2.5 | Secret | now |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | secret | step 2.5 | Secret | now |
| `ADMIN_EMAIL` | your Gmail | you | Config | now |
| `BETA_ALLOWED_EMAILS` | panel Gmail addresses, comma-separated | you | Config | now |
| `SITE_MODE` | `beta` | you | Config | now |
| `OPERATOR_NAME` | your name, as shown on /privacy and /terms | you | Config | now |
| `CONTACT_EMAIL` | an address you read | you | Config | now |
| `BETTER_AUTH_URL` | `https://<domain>` (no trailing slash) | step 5.6 | Config | step 8 |
| `NEXT_PUBLIC_SITE_URL` | `https://<domain>` | step 5.6 | Config | step 8 |
| `GOOGLE_CLIENT_ID` | client id | step 7.5 | Config | step 8 |
| `GOOGLE_CLIENT_SECRET` | client secret | step 7.5 | Secret | step 8 |
| `ANTHROPIC_API_KEY` | an API key from console.anthropic.com | you | Secret | menus |
| `ANTHROPIC_VISION_MODEL` | `claude-sonnet-5-5` | you | Config | menus |
| `ANTHROPIC_MATCH_MODEL` | `claude-haiku-5-5` | you | Config | menus |

Do not set `NODE_ENV`. Leave out `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (nothing uses them
yet), and `SUPABASE_DISH_PHOTOS_BUCKET` and `SUPABASE_MENUS_BUCKET` (they default to `dish-photos` and
`menus`). The three `ANTHROPIC_*` rows ("menus") turn on reading menu photos; without them uploads
still work and wait on /admin/menus. At most 50 menu photos are read in any 24 hours (about a cent
each).

## 7. Google sign-in (Google Auth Platform)

1. console.cloud.google.com, signed in with your personal Google account → new project `Kahan Khayen`.
2. **Google Auth Platform** → Get started: app name `Kahan Khayen` (a project set up under the old
   name: Branding → App name → `Kahan Khayen`; the project ID and the client stay as they are), user support e-mail = your Gmail,
   Audience **External**, contact e-mail = your Gmail. Create.
3. **Branding** → Authorized domains → add `<domain>`. Optional: home page `https://<domain>`,
   privacy `https://<domain>/privacy`, terms `https://<domain>/terms`.
4. **Audience**: leave the publishing status on **Testing**. Under Test users, add your Gmail and
   the panel's Gmail addresses (up to 100). Note: for plain Google sign-in Google lets every
   account in even in Testing; `BETA_ALLOWED_EMAILS` is what keeps the beta private.
5. **Clients** → Create client → Web application, name `Kahan Khayen production`:
   - Authorized JavaScript origins: `https://<domain>`
   - Authorized redirect URIs: `https://<domain>/api/auth/callback/google`
   - Create, then copy the **Client ID** and **Client secret** at once (or download the JSON): the
     secret is never shown again. Changes can take from 5 minutes to a few hours to work.

## 8. Finish the variables and redeploy

1. Vercel → Settings → Environment Variables: add `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL`,
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Production).
2. Deployments → the latest one (the failed build from step 5) → ⋯ → **Redeploy**.
3. In the build log, check: pnpm `12.14.0`, Node `24.x`, no "stopped before migrations" line (the
   environment check passed), `prisma migrate deploy` → "No pending migrations to apply", then the
   Next.js build.

## 9. First admin sign-in

1. Open `https://<domain>/sign-in` → Sign in with Google with the `ADMIN_EMAIL` account.
2. Open `https://<domain>/admin`: you see the admin pages.
   - Sign-in says "not invited": `ADMIN_EMAIL` is not exactly the Google account you used. Fix it
     in Vercel and redeploy.
   - You see "Forbidden": the account exists without the admin role (`ADMIN_EMAIL` did not match
     when it was created, but the address was in `BETA_ALLOWED_EMAILS`). Fix `ADMIN_EMAIL`,
     redeploy, then Supabase → SQL Editor →
     `update "User" set role = 'ADMIN' where email = '<your gmail>';` and reload.
3. `/admin/import`: review Overture candidates and **Create** the first restaurants. The panel can
   only rate restaurants that exist.
4. After panel members have signed in once: `/admin/users` → **Panel on** for each of them.

## 10. Smoke test on your phone

Use Chrome (Android) or Safari (iPhone), not the Instagram or Facebook in-app browser (Google
blocks sign-in there).

1. `https://<domain>`: the **Beta** label shows and the home page lists Islamabad's dishes.
2. `https://<domain>/robots.txt` says `Disallow: /`.
3. `/privacy` and `/terms` show your name and contact e-mail, not
   `[operator name: set OPERATOR_NAME]` or `[contact e-mail: set CONTACT_EMAIL]`.
4. Sign in → `/rate` → one of your restaurants → a dish → 8 → open **Add details (optional)** →
   **Photo**: choose a picture → **Submit rating**: "Thanks for rating!". The restaurant's page
   shows the vote.
5. My ratings → delete that rating. Supabase → Storage → `dish-photos`: its photo file is gone.
6. Open a private (incognito) tab → `https://<domain>/sign-in` → Sign in with Google → **Use
   another account** → a Gmail that is not in `BETA_ALLOWED_EMAILS`. You land back on the sign-in
   page with "Kahan Khayen is a private beta and this Google account is not invited yet". (A private tab
   keeps your own session; **Sign out** in the header works too.)
7. `/admin/rankings` → **Recompute now**: a new run marked ok. The next morning a run marked
   `cron` should be there (it fires between 02:00 and 02:59 PKT).
8. Menu photo (needs the `menus` bucket, and the `ANTHROPIC_*` variables to be read): on a
   restaurant page, **Upload menu photo** (shown to you as admin and to panel members) → a photo of
   a menu → "Thanks! The menu photo is in." Then `/admin/menus` → the upload → **Parse now**: its
   items appear next to the photo; tap a suggestion for an item under "Needs review", or Ignore it.
   The restaurant page now lists the matched dishes with their menu prices.
9. When all of this works: Supabase → Database Settings → SSL Configuration → turn on **Enforce
   SSL on incoming connections** (a short restart), then open the home page again.

## Every push to `main`

1. **New environment variables go into Vercel first.** When the code you are about to push needs a
   new variable (its commit, `.env.example` or `docs/10` names it), add it in Vercel → Settings →
   Environment Variables (Production) **before** you push. The build checks every variable a
   production server needs (`src/env.ts`) before it migrates anything: if one is missing or
   invalid, the build stops and lists only the names (never values), and the last good deployment
   keeps serving. Then add the variable and **Redeploy** the failed deployment.
2. Push `main`. If the build fails, its log says why (Deployments → the deployment → Building).
   When the deployment is ready, `https://<domain>/api/health` shows `{"ok":true}`.

## Uptime monitor (once)

1. Sign up with your own e-mail at a free uptime monitor, for example uptimerobot.com or
   betterstack.com.
2. New monitor → **HTTP(S)** → URL `https://<domain>/api/health`, method GET, interval 5 minutes
   (1 minute if the plan allows), alert by e-mail when it is down (any status other than 200).
3. Check: the monitor shows the site up, and the URL shows `{"ok":true}` in a browser.
   A 503 means the database did not answer within 3 s: Vercel → Logs → `health.fail` says whether
   it timed out or failed, and why (Hobby keeps an hour of logs).

## Daily database backup (once)

Supabase Free keeps no backups; a GitHub Actions workflow takes one every night at 03:00 PKT
(how it works and how to restore: `docs/10` "Backups and restore").

1. On your laptop: `openssl rand -base64 32` → save it in your password manager as
   **Kahan Khayen backup passphrase** first. Without it no backup can ever be read.
2. github.com/JawadSarfraz/dishrank → Settings → Secrets and variables → Actions → **New repository
   secret**:
   - `PROD_DIRECT_URL` = the same value as Vercel's `DIRECT_URL` (session pooler, port 5432,
     `?sslmode=require`).
   - `BACKUP_PASSPHRASE` = the passphrase from step 1.
3. Actions → **Database backup** → **Run workflow** → branch `main` → Run workflow. After a couple of
   minutes: a green tick, and under Artifacts `dishrank-<date>T<time>Z`.
4. Restore that backup once into a scratch database on your laptop (`docs/10`, six commands), then
   drop it.
5. GitHub → Settings → Notifications → Actions: e-mail on, failed workflows only. A failed backup
   then sends you an e-mail.

## Updating an existing beta to Phase 6

Do these in order; step 1 first, or the build stops at its environment check (the old version
keeps serving).

1. Vercel → Settings → Environment Variables: add `IP_HASH_SECRET` (Production, Secret) = a new
   `openssl rand -hex 32`, different from `CRON_SECRET`.
2. Push `main`. The build runs the new migrations (menu Urdu names, analytics, area radii, claim
   review fields, uploads, account deletion).
3. New area radii and Overture refresh on production, from your laptop (as step 4 above):
   `pnpm prod:bootstrap`. It reseeds the areas with their radii, then syncs the newest Overture
   release: unreviewed candidates get the release's data and are placed again with the radii;
   reviewed ones keep theirs.
4. Smoke test: on a restaurant page, **Is this your restaurant?** → send a claim with a second
   Google account → `/admin/review` → **Owner claims** → **Approve owner** → that account sees
   **Owner** in the header and its restaurant on `/owner`. `/admin/analytics` shows counts after a
   few page views. On `/me`, **Delete my account** with a test account (not the admin).

## Later

- Invite someone to the panel: a link on `/admin/users` (no redeploy). While still in beta, adding a
  Gmail to `BETA_ALLOWED_EMAILS` and redeploying lets them in without the panel.
- Never change `IP_HASH_SECRET` lightly: it also keys the ban list, so a new value lets banned accounts
  sign up again (docs/10).
- Supabase Free pauses a project after a week of low activity; if its warning e-mail arrives, open
  the dashboard. Plan Pro (Supabase's own daily backups) before a wider launch.
- Hobby is for non-commercial use: move Vercel to Pro before charging anyone.
