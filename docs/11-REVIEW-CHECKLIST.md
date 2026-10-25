# 11 — Review checklist (use after every phase and before launch)

Tick each item with a file reference. Anything in **Security** or **Data policy** must be ✅ before production.

## Security
- [ ] Every server action calls `requireUser()` or `requireRole()` before touching data
- [ ] Every `/api/v1` handler does the same
- [ ] `/api/cron/*` fail closed: 500 when `CRON_SECRET` is unset or empty, 401 on mismatch, constant-time compare
- [ ] `owner/` and `admin/` layouts **and every page under them** call `requirePageRole()`; signed-out → sign-in redirect, wrong role → Forbidden page with no data fetched; no role from client input
- [ ] Admin/owner services take the current user and call `requireRole()` themselves (a page without a check still gets FORBIDDEN)
- [ ] `src/env.ts` validates every required env var; a production start with one missing fails
- [ ] All inputs parsed with Zod; string lengths bounded (comment ≤ 280, names ≤ 120)
- [ ] Storage paths validated (prefix + owner); uploads only through Supabase signed upload URLs from `/api/v1/uploads/sign` (fixed 2 h validity, one path each); dish photos public under random cuid names, menus in the private bucket; max 5 MB; JPEG/WebP only
- [ ] Client-side resize re-encodes every photo, so EXIF/GPS metadata never reaches storage (check one uploaded file with `exiftool`)
- [ ] Rate limits applied to every write path and search
- [ ] Owner cannot rate own restaurant; owner cannot see rater identities
- [ ] Security headers set; no secrets in client bundles (`grep NEXT_PUBLIC` review)
- [ ] `pnpm audit` has no high/critical
- [ ] Dev-only scripts refuse to run when `NODE_ENV=production`

## Data policy
- [ ] No Google Places anywhere: no Places client, key, endpoint or cron (`tests/unit/ops/no-google-places.test.ts` passes); Google is only the sign-in provider
- [ ] Every restaurant was created or confirmed by an admin: `OVERTURE` restaurants from a reviewed candidate on /admin/import, `MANUAL` ones by hand; `pnpm overture:sync` writes only `OvertureCandidate`
- [ ] Overture candidates come only from Meta and Microsoft records (no AllThePlaces, no Foursquare); staged addresses and websites hold no Google links (SQL check: `address ~* 'goo\.gl|google\.'` finds nothing)
- [ ] `/about/data` shows Overture's credit lines (release and access date) and links the CDLA Permissive 2.0 text; the public footer links it
- [ ] No scraping code anywhere (grep for `cheerio`, `puppeteer`, `playwright` outside tests, `foodpanda`)
- [ ] Rankings computed only from `Rating` rows (grep for any external score field)
- [ ] Privacy page states what we store (email, ratings, photos) and how to delete

## Product rules
- [ ] No free-text dish creation by users (only via admin resolve)
- [ ] Rank numbers only for eligible rows; thresholds enforced in service, not UI
- [ ] Bootstrap mode label shown when active
- [ ] "Not enough votes yet" section present and ordered by votes
- [ ] Re-rating replaces and logs history
- [ ] Burst detection, HELD ratings excluded from compute
- [ ] Stale marking works (test by backdating a row)
- [ ] Copy contains no hygiene/health claims; dispute page linked in footer

## Performance
- [ ] Ranking query uses the `(cityId, dishId, status, score)` index (EXPLAIN)
- [ ] Public pages are ISR; `revalidatePath` fires after rating writes
- [ ] Lighthouse mobile ≥ 90 on ranking page and restaurant page
- [ ] Images resized client-side before upload; served with `next/image`
- [ ] No N+1 on restaurant page (one query with include)

## SEO
- [ ] Unique title/description per ranking page; canonical; OG image
- [ ] JSON-LD ItemList (ranking) and Restaurant (restaurant page) validate
- [ ] `sitemap.xml` and `robots.txt` present; non-public routes disallowed
- [ ] URLs stable: `/[city]/best-[dish]`, `/[city]/r/[slug]`; a merged restaurant's URL redirects permanently to the surviving one

## Accessibility / mobile
- [ ] Usable at 360 px width; tap targets ≥ 44 px on the score input
- [ ] Forms have labels; errors announced; focus management on multi-step rate flow
- [ ] Color contrast AA on score badges

## Ops
- [ ] `JobRun` rows for crons; admin can see last runs and trigger recompute
- [ ] Error monitoring or at least Vercel log drains checked
- [ ] Backup plan documented and tested once (restore to a scratch project)
- [ ] `.env.example` complete; README setup works on a clean machine

## Launch day
- [ ] Panel (≥ 8 users) has `isPanel` set (trust 1.3) and has rated ≥ 10 restaurants per launch dish
- [ ] Every launch dish page in Islamabad shows ≥ 5 eligible restaurants (bootstrap mode)
- [ ] Facebook-group partner post scheduled; share buttons tested on WhatsApp
- [ ] Dispute inbox monitored; admin review queue empty
