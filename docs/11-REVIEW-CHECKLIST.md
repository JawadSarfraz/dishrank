# 11 — Review checklist (use after every phase and before launch)

Tick each item with a file reference. Anything in **Security** or **Data policy** must be ✅ before production.

**Status after Phase 6 (2026-11-04):** ✅ done (with where) · ⏳ pending, needs the owner (what to do) · N/A not applicable yet. Code items are checked by tests where a test is named; ⏳ items need the production project, real data or a person.

## Security
- [x] Every server action calls `requireUser()` or `requireRole()` before touching data. ✅ `tests/unit/ops/security-surface.test.ts` scans `src/server/actions/*`; the two anonymous ones are listed there on purpose (`fileDisputeAction`, limited per IP; `menuUploadAccessAction`, read only).
- [x] Every `/api/v1` handler does the same. ✅ same test: every write needs a session except `/disputes` and `/events` (per-IP limits); every public GET has a rate limit; `/v1/admin/*` needs `requireRole("ADMIN")`.
- [x] `/api/cron/*` fail closed: 500 when `CRON_SECRET` is unset or empty, 401 on mismatch, constant-time compare. ✅ `src/server/cron.ts`; `tests/unit/ops/cron.test.ts` calls every scheduled route without the secret.
- [x] `owner/` and `admin/` layouts **and every page under them** call `requirePageRole()`; signed-out → sign-in redirect, wrong role → Forbidden page with no data fetched; no role from client input. ✅ `src/app/admin/**`, `src/app/owner/**` (incl. /admin/menus, /admin/analytics, /owner/restaurants/[id]); `tests/unit/ops/security-surface.test.ts` checks every page and layout statically (audit 2026-11); `tests/e2e/admin.spec.ts`.
- [x] Admin/owner services take the current user and call `requireRole()` themselves (a page without a check still gets FORBIDDEN). ✅ `assertRole` in `admin.service.ts`, `review.service.ts`, `menu.service.ts`, `owner.service.ts` (an owner's other restaurants answer 404), `analytics.service.ts`; `tests/unit/auth/roles.test.ts`, `tests/unit/owner/owner-db.test.ts`.
- [x] `src/env.ts` validates every required env var; a production start with one missing fails. ✅ `src/env.ts` (now incl. `IP_HASH_SECRET`), `tests/unit/ops/env.test.ts`.
- [x] All inputs parsed with Zod; string lengths bounded (comment ≤ 280, names ≤ 120). ✅ `src/server/validation`; JSON bodies over 32 KB → 413 (`src/server/http.ts`), server action bodies ≤ 128 KB (`next.config.ts`).
- [x] Storage paths validated (owner + prefix); uploads only through presigned S3 `PUT` URLs from `/api/v1/uploads/sign` (ADR-14: 10 minutes, one object key, content type signed); a rating's photo is checked on the server (exists, ≤ 5 MB, JPEG/WebP, on no other rating); dish photos public under random names (`dish-photos/<random>.<ext>`, no user id since Phase 6), menus in the private bucket. ✅ `src/server/services/upload.service.ts` (the `Upload` row records the signer), `tests/unit/storage/*`, `tests/unit/menu/menu-db.test.ts`.
- [ ] Client-side resize re-encodes every photo, so EXIF/GPS metadata never reaches storage (check one uploaded file with `exiftool`). ✅ code: `src/lib/image.ts`. ⏳ owner: upload a phone photo on the live site, download it from Supabase Storage and run `exiftool` on it (no GPS lines).
- [x] Rate limits applied to every write path and search. ✅ `src/server/rate-limit.ts` (Phase 6 added `claim`, `owner-write`, `account-delete`, `ip:event`); `tests/unit/ops/rate-limit-db.test.ts`.
- [x] Owner cannot rate own restaurant; owner cannot see rater identities. ✅ `rating.service.ts` (`OWNER_SELF_RATING`), `ranking.repo.ts` (their earlier ratings stop counting), `owner.service.ts` (aggregates only); `tests/unit/owner/*`. An admin can remove an owner (reason required, logged): the OWNER role goes when they manage nothing else and the normal rating rules apply again. ✅ `removeRestaurantOwner` in `claim.service.ts`; `tests/unit/owner/claim-db.test.ts`.
- [x] Security headers set; no secrets in client bundles (`grep NEXT_PUBLIC` review). ✅ `src/lib/security-headers.ts` (basic CSP, nosniff, frame deny, referrer, permissions, HSTS on Vercel); only `NEXT_PUBLIC_SITE_URL` is public; the security-surface test fails if a client component imports server code (other than actions or types) or `@/env`.
- [x] `pnpm audit` has no high/critical. ✅ 2026-11-04: one low (deepmerge, no fix yet, via the `shadcn` CLI); overrides in `pnpm-workspace.yaml` (docs/10 Dependency audit).
- [x] Dev-only scripts refuse to run when `NODE_ENV=production`; `pnpm dev:demo` also refuses Vercel and any database URL that is not on this machine. ✅ `src/lib/dev-only.ts` (dev:demo, research:overture), `src/server/services/dev-demo-guard.ts`; tests in `tests/unit/ops/security-surface.test.ts`, `tests/unit/dev-demo/`.
- [x] No sign-in bypass in app code: e2e tests sign in with a real session row and its signed cookie (`tests/e2e/setup/prepare.ts`). ✅
- [ ] Supabase connections use verified TLS (`src/server/db-ssl.ts`; no `sslmode` in `DATABASE_URL`), "Enforce SSL" is on and the Data API is off. ✅ code: `src/server/db-ssl.ts`, `src/env.ts`; the daily backup verifies the same root CA (`scripts/db-backup.sh`, `config/supabase-root-2021.crt`, audit 2026-11). ⏳ owner: Supabase dashboard, Data API off (DEPLOY-CHECKLIST 1.2) and Enforce SSL on (10.9).
- [ ] In beta only invited Google accounts can sign up (`BETA_ALLOWED_EMAILS`): a Gmail not on the list gets the invite-only message. ✅ code and test: `src/server/site.ts`, `tests/unit/ops/site-mode.test.ts`. ⏳ owner: DEPLOY-CHECKLIST 10.6 on the live site.
- [x] Admin trust overrides are admin-only, validated (0.3 to 1.5) and kept by the nightly job. ✅ `admin-users.service.ts`, `ranking-nightly.service.ts`; `tests/unit/admin/admin-users-db.test.ts`.

## Data policy
- [x] No Google Places anywhere: no Places client, key, endpoint or cron (`tests/unit/ops/no-google-places.test.ts` passes); Google is only the sign-in provider. ✅
- [x] Every restaurant was created or confirmed by an admin: `OVERTURE` restaurants from a reviewed candidate on /admin/import, `MANUAL` ones by hand; `pnpm overture:sync` writes only `OvertureCandidate`. ✅ `import.service.ts`, `overture-sync.service.ts` (a re-sync refreshes only NEW candidates); `tests/unit/overture/sync-db.test.ts`.
- [ ] Overture candidates come only from Meta and Microsoft records (no AllThePlaces, no Foursquare); staged addresses and websites hold no Google links (SQL check: `address ~* 'goo\.gl|google\.'` finds nothing). ✅ code: `overture/places.ts`; the SQL check finds 0 rows on the dev database (2026-11-04). ⏳ owner: run the same SQL on production (Supabase SQL Editor).
- [x] `/about/data` shows Overture's credit lines (release and access date) and links the CDLA Permissive 2.0 text; the public footer links it. ✅ `src/app/(public)/about/data`, `src/components/layout/Footer.tsx`.
- [x] No scraping code anywhere (grep for `cheerio`, `puppeteer`, `playwright` outside tests, `foodpanda`). ✅ none in `src`; `foodpanda` appears only in the research script's list of link domains to drop; Playwright only in `tests/` and its config.
- [x] Rankings computed only from `Rating` rows (grep for any external score field). ✅ `ranking.service.ts`, `ranking.repo.ts`; Overture confidence only orders the import list.
- [x] Privacy page states what we store (email, ratings, comments, photos, panel members' shared locations) and how to delete; privacy and terms stay marked as drafts until a lawyer reviewed them. ✅ `src/app/(public)/privacy/page.tsx` (Phase 6: self-serve account deletion, owners, visit counts, random photo names). ⏳ owner: legal review before launch.
- [x] Restaurant pages link to Google Maps only as a plain URL built from our own coordinates (no embedded map, no Maps API call). ✅ `src/app/(public)/[city]/r/[slug]/page.tsx`.
- [ ] Deleting a rating (or replacing its photo) deletes the photo file from Storage; /privacy and /terms show `OPERATOR_NAME` and `CONTACT_EMAIL`, not placeholders. ✅ code: `upload.service.ts` (`deleteUnusedPhotos`, nightly clean-up), `tests/unit/rating/rating-db.test.ts`. ⏳ owner: DEPLOY-CHECKLIST 10.3 and 10.5 on the live site.

## Product rules
- [x] No free-text dish creation by users (only via admin resolve). ✅ `proposal.service.ts` (review items only), `review.service.ts`.
- [x] Rank numbers only for eligible rows; thresholds enforced in service, not UI. ✅ `rerankCityDish` SQL in `ranking.repo.ts`; `tests/unit/ranking/*`.
- [x] Bootstrap mode label shown when active. ✅ "Early rankings" on `src/app/(public)/[city]/[slug]/page.tsx` and the city page.
- [x] "Not enough votes yet" section present and ordered by votes. ✅ `public.repo.ts`, `tests/unit/ranking/get-ranking-db.test.ts`, `tests/e2e/ranking.spec.ts`.
- [x] Re-rating replaces and logs history; an edit keeps HELD/HIDDEN. ✅ `rating.service.ts`, `tests/unit/rating/rating-db.test.ts`.
- [x] Burst detection (panel exempt) and comment holds; HELD ratings excluded from compute. ✅ `rating.service.ts`, `comment-screen.ts` (phone, link, e-mail, and the blocklist in `config/comment-blocklist.json`); tests in `tests/unit/rating/`.
- [x] `rankInCity` re-ranked after every recompute, status change and merge (docs/03 6f). ✅ `ranking.service.ts`, `restaurant.service.ts`; owner edits and menu verifications recompute too.
- [x] Stale marking works (test by backdating a row). ✅ `tests/unit/ranking/nightly-db.test.ts`.
- [x] Copy contains no hygiene/health claims; dispute page linked in footer. ✅ grep of `src/app/(public)` and `src/components` finds none; `Footer.tsx`.

## Performance
- [ ] Ranking query uses the `(cityId, dishId, status, score)` index (EXPLAIN). ⏳ the dev database has no dish rows, so the planner's choice says nothing yet; run `EXPLAIN ANALYZE` of the docs/04 query on production once a city has a few hundred dish rows.
- [x] Public pages are ISR; `revalidatePath` fires after rating writes. ✅ `revalidate = 3600` on public pages, `src/server/revalidate.ts`.
- [ ] Lighthouse mobile ≥ 90 on ranking page and restaurant page. ⏳ owner: Chrome DevTools → Lighthouse (mobile) on the live ranking and restaurant pages.
- [ ] Images resized client-side before upload; served with `next/image`. ✅ resize: `src/lib/image.ts`. N/A `next/image`: no public page shows an uploaded image yet (the only `<img>` is the admin's private menu photo through a signed link).
- [x] No N+1 on restaurant page (one query with include). ✅ `getPublicRestaurant` in `restaurant.service.ts`: one query for the restaurant and one for all its dish rows, none per dish.

## SEO
- [x] Unique title/description per ranking page; canonical; OG image. ✅ `src/app/(public)/[city]/[slug]/page.tsx`, `opengraph-image.tsx`.
- [ ] JSON-LD ItemList (ranking) and Restaurant (restaurant page) validate. ✅ code: `src/server/seo.ts`. ⏳ owner: Google's Rich Results Test on one live ranking page and one restaurant page (after `SITE_MODE=live`).
- [x] `sitemap.xml` and `robots.txt` present; non-public routes disallowed. ✅ `src/app/sitemap.ts`, `src/app/robots.ts`, `src/server/site.ts` (/admin, /owner, /me, /rate, /sign-in, /api).
- [x] While `SITE_MODE=beta`: every page noindex, an `X-Robots-Tag` header on every response, robots.txt `Disallow: /`, the "Beta" label; `SITE_MODE=live` at launch removes all of it. ✅ `src/lib/site-mode.ts`, `tests/unit/ops/site-mode.test.ts`.
- [x] Ranking pages that rank nobody and restaurant pages without a rating are `noindex` and left out of the sitemap; JSON-LD never carries an `aggregateRating`. ✅ `src/app/sitemap.ts`, `src/server/seo.ts`.
- [x] URLs stable: `/[city]/best-[dish]`, `/[city]/r/[slug]`; a merged restaurant's URL redirects permanently to the surviving one. ✅ `restaurant.service.ts` (slugs never change), `tests/unit/restaurants/merge-db.test.ts`.

## Accessibility / mobile
- [x] Usable at 360 px width; tap targets ≥ 44 px on the score input. ✅ `tests/e2e/*` run at 360 px (no sideways scroll, 4 taps to rate).
- [x] Forms have labels; errors announced; focus management on multi-step rate flow. ✅ `RateFlow.tsx`, forms use `<label>` and `role="alert"` for errors.
- [x] Color contrast AA on score badges. ✅ the badge is foreground on background (near black on white).

## Ops
- [x] `JobRun` rows for crons; admin can see last runs and trigger recompute; a second recompute while one runs is refused (`409 JOB_RUNNING`). ✅ `/admin/rankings`, `ranking-nightly.service.ts`, `menu.service.ts` (parse-menus job); `tests/unit/ranking/nightly-db.test.ts`.
- [ ] An uptime monitor checks `GET /api/health` (200 only when the database answers within 3 s). ✅ code and test: `src/app/api/health/route.ts`, `src/server/services/health.service.ts`, `tests/unit/ops/health-db.test.ts`, `tests/e2e/health.spec.ts`. ⏳ owner: create the monitor (DEPLOY-CHECKLIST "Uptime monitor").
- [ ] Error monitoring or at least Vercel log drains checked. ⏳ owner: Vercel → Logs once a day during the beta (Hobby keeps an hour of logs), or add a log drain / Sentry.
- [ ] Backup plan documented and tested once (restore to a scratch project). ✅ daily encrypted backup: `.github/workflows/db-backup.yml`, `scripts/db-backup.sh`; restore steps in docs/10 "Backups and restore", tested 2026-11-04 with a backup of the local dev database (row counts, extensions, indexes and `prisma migrate status` matched). ⏳ owner: add the two secrets, run the first backup and restore it once (DEPLOY-CHECKLIST "Daily database backup").
- [x] `.env.example` complete; README setup works on a clean machine. ✅ `.env.example` lists every variable (incl. `IP_HASH_SECRET`); CI's `vercel-build` job builds from a clean checkout.

## Launch day
- [ ] Panel (≥ 8 users) has `isPanel` set (trust 1.3) and has rated ≥ 10 restaurants per launch dish. ⏳ owner.
- [ ] Every launch dish page in Islamabad shows ≥ 5 eligible restaurants (bootstrap mode). ⏳ owner.
- [ ] Facebook-group partner post scheduled; share buttons tested on WhatsApp. ⏳ owner.
- [ ] Dispute inbox monitored; admin review queue empty. ⏳ owner.
