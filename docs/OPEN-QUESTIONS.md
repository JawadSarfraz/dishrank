# Open questions and decisions log

Format: `- [ ] Q: … | Default taken: … | Decided: <date> …`

## Open

Unresolved findings from the kickoff audit (unverified leads, with proposed defaults): `docs/KICKOFF-REVIEW.md`.

- [ ] Q: Should Islamabad and Rawalpindi share one ranking ("Twin cities") or stay separate? | Default: separate cities, each with its own prior and thresholds; a "Twin cities" combined view can be added later as a query over both cityIds.
- [ ] Q: Minimum raters at launch — 8 normal / 4 bootstrap. Too strict for small dishes (e.g. Katakat)? | Default: keep; revisit after 4 weeks of data.
- [ ] Q: Should a photo be required for the first rating a user makes at a restaurant? | Default: optional; photo raises trust instead.
- [ ] Q: Google Places candidate name/address prefill in the Confirm form — acceptable under Places policy? | Default: prefill allowed only within 30 days of fetch; admin must click Confirm; stored record is ours. Legal review before scale.
- [ ] Q: Phone OTP vs Google-only sign-in at launch? | Default: Google only; OTP in Phase 7.
- [ ] Q: Urdu-script menus — manual entry or OCR? | Default: manual via admin for now.
- [ ] Q: Pricing for owner report/badge? | Default: not in v1; test PKR 3–10k/month by direct sales after month 2.

## Decided

- 2026-10-22: Single Next.js app; Postgres + Prisma on Supabase; TypeScript only (ADR-1..3).
- 2026-10-22: Ratings 1–10 with Bayesian score, half-life 180 days, prior weight 8 (docs/04).
- 2026-10-22: Dish taxonomy: meat type = separate dish; preparation style = variant tag (docs/05).
- 2026-10-22: Repo layout: `CLAUDE.md`, `README.md`, `docs/`, `seed/` moved from `dishrank-kit/` to the repo root; `dishrank-kit/` deleted; README and docs/09 setup steps updated.
- 2026-10-22: Matching is "match first, tag second" (docs/05): `normalize()` strips only prices and size words; the longest alias contained in the text as whole words wins; only leftover words become variant tags; words inside the matched alias are never stripped.
- 2026-10-22: Meat words (chicken, mutton, beef, fish, prawn, veg, egg) removed from `seed/variant-tags.json`; they live in `seed/meat-words.json` and drive the leftover-meat check, the meat-word retry and meat-word safety.
- 2026-10-22: Tag/alias collisions fixed in the seed: "hot" (spicy) and "desi murgh" removed from tag words; bare tag-word aliases "tikka" and "namkeen" removed; aliases whose tag word sits at the start or end and whose remainder already matches the same dish removed, so the word becomes a tag (cheese burger, lahori chanay, peshawari chapli kabab, bbq/fajita/pepperoni/cheese/tikka pizza, …); identity aliases kept (cheese cake, crispy chicken, flat white, chicken tikka pizza, chicken cheese burger).
- 2026-10-22: Seed cleanup forced by the new pipeline: aliases containing size words or punctuation removed (tikka piece, chest piece, lassi glass, hot & sour, …); generic aliases "tea" (chai) and "soup" (hot and sour soup) removed because contained matching made "Green Tea" and "Chicken Soup" match them; "dahi bhaly" added; size words "per kg", "per plate", "per piece", "dozen" added. 523 → 476 aliases; 478 `DishAlias` rows with names.
- 2026-10-22: Leftover rule (proposed during review, accepted by the owner): unknown leftover words lower an alias match to 0.75 and a leftover meat word of a different meat to 0.60, so both go to review instead of auto-creating. Prevents "Fish Karahi" → fried fish and "Prawn Biryani" → chicken biryani at 1.0.
- 2026-10-22: Trigram: new `DishAlias` table (one row per spelling, unique alias, GIN trigram index) replaces `Dish.aliases` and `Dish.searchText`; matching and dish search compare one alias at a time. Thresholds measured with pg_trgm on the seed: candidates ≥ 0.45; trigram confidence capped at 0.80, so trigram never auto-creates; auto-create ≥ 0.85 for any method; review with suggestions 0.45–0.85; meat-word safety cap 0.50 (docs/05, docs/03, docs/02 menu diagram).
- 2026-10-22: docs/05 test table rewritten to agree with the longest-alias rule ("Mutton Peshawari Namkeen Karahi" → namkeen-gosht [peshawari]; "Dahi Bhaly Chaat" and "Chikan Kadhai" → review with the right suggestion) and extended with six rows; docs/08 Phase 1 acceptance updated to match.
- 2026-10-22: Versions (ADR-12): Node.js 24 LTS (`.nvmrc` 24, `engines.node` "24.x"), Next.js 16 stable, Prisma ORM latest stable 7.x (not the 8.0 RC) with `prisma.config.ts` and `@prisma/adapter-pg`.
- 2026-10-22: Auth (ADR-11): Better Auth replaces Auth.js v5: Google sign-in, Prisma adapter, database sessions, roles USER/OWNER/ADMIN, `requireUser()` / `requireRole()` kept; docs/03 auth models are Better Auth's User/Session/Account/Verification; ADMIN_EMAIL becomes ADMIN on first sign-in through a user-create hook.
- 2026-10-22: docs/03 one-line enums expanded to multi-line; the original schema did not parse. The schema now validates with `prisma validate` 7.10.1.
- 2026-10-22: Owner accepted the four review additions: the leftover rule (0.75 / 0.60), dropping the "tea" and "soup" aliases, the docs/03 enum fix, and `docs/KICKOFF-REVIEW.md`.
- 2026-10-22: Ranking-page filters: one cached page per city × dish; area filter, sort and distance run in the browser; rank numbers are always city-wide (docs/02, docs/04, docs/06, docs/09 Prompt 5). Phase 7 note in docs/08: static area pages `/[city]/best-[dish]/[area]` only if SEO needs them.
- 2026-10-22: Early rankings: the seed leaves `City.launchedAt` NULL; NULL means bootstrap mode; an admin sets it once from /admin on launch day (`POST /api/v1/admin/cities/:slug/launch`; docs/03, docs/04, docs/06, docs/09 Prompts 2 and 5).
- 2026-10-22: Panel: admin-only `User.isPanel`; trust fixed at 1.3 and skipped by the nightly trust job; exempt from the new-account burst rule; 10 ratings per restaurant per day and 30 per day; still blocked from rating restaurants they own; toggled on /admin/users (Prompt 4). Updated docs/03, docs/04, docs/06, docs/07, docs/09, docs/11, CLAUDE.md.
- 2026-10-22: Photos: public `dish-photos` bucket with random cuid file names; private `menus` bucket; uploads only through Supabase signed upload URLs (fixed 2 h); client-side resize re-encodes the image, stripping EXIF/GPS (new docs/11 item; link-expiry item reworded). Updated docs/02, docs/06, docs/07, docs/09, docs/10, docs/11.
- 2026-10-22: Environments, no Docker: local dev uses Homebrew PostgreSQL with the same major version as the Supabase projects, plus pg_trgm and unaccent; local storage uses the preview Supabase project; CI uses a postgres service container; cloud projects are preview and production (docs/08, docs/09 Prompt 1, docs/10).
- 2026-10-22: Phase 0 dependencies approved as proposed and recorded in docs/09 Prompt 1: Next.js 16.4, React 19.3, Better Auth 1.7, Prisma 7.10 with @prisma/adapter-pg, Zod 4, Tailwind 4, TypeScript 6.0, ESLint 10 flat config, Vitest 5, Playwright 1.64, pnpm 12.14. The docs/02 tree no longer lists `tailwind.config.ts`.
- 2026-10-22: `docs/KICKOFF-REVIEW.md` triaged in one pass: every finding is marked blocker for Phases 0–2, later phase, or drop.
