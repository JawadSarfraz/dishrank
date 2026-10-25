# 01 — Product spec (v1)

## One line

"Where is the best chicken karahi in Islamabad?" — answered with a ranked list built from dish-level ratings by real diners.

## Why this exists

- People in Pakistan crave a **dish**, not a restaurant. Every app rates restaurants as a whole.
- Facebook food groups answer this question daily, but the answers are scattered and never ranked.
- Nobody in Pakistan ranks restaurants per dish with data. (See research summary in `docs/08`.)

## v1 scope

| Item | Decision |
|---|---|
| Cities | Islamabad, Rawalpindi (treated as two cities, shared areas list) |
| Dishes | 19 launch dishes flagged `isLaunch` in `seed/dishes.json`; full taxonomy ~70 dishes available for rating |
| Platform | Responsive web app (Next.js). No native apps in v1. |
| Language | English UI. Search tolerant to Roman Urdu spellings. |
| Auth | Google sign-in only (phone OTP later) |
| Ratings | 1–10 overall (required), optional taste/portion/value 1–5, optional photo, optional comment ≤ 280 chars |
| Ranking | Bayesian-weighted score with time decay and user trust; eligibility thresholds (docs/04) |
| Monetisation | Not in v1 code, but data model supports owner claims + reports (Phase 7) |

### Explicit non-goals (v1)

- No ordering, delivery, reservations, payments
- No full restaurant reviews (text reviews about service/ambience)
- No multi-city expansion beyond Islamabad/Rawalpindi
- No importing of Google/foodpanda ratings
- No native mobile apps
- No Urdu-script UI

## Personas

1. **Diner (primary)** — 18–35, phone user, wants a fast answer: "best X near me / in area Y", then goes.
2. **Panel member** — trusted early rater (friends, foodies). Rates many dishes, uploads menu photos. Has higher trust weight.
3. **Restaurant owner / manager** — wants to see their dish ranks, claim the listing, correct the menu. Future paying customer.
4. **Admin (you)** — imports candidates, resolves review queue, moderates, manages trust.

## User stories (v1 — all must be met before launch)

### Diner
- D1. As a diner I can pick a city and a dish and see restaurants ranked for that dish, with score, number of votes, area and price band.
- D2. I can filter by area and sort by score / votes / price, or by distance when I share my location (our own restaurant coordinates).
- D3. I can open a restaurant page and see all its dishes with scores, best dish first.
- D4. I can search a restaurant (Roman Urdu tolerant) and rate a dish there in under 30 seconds on my phone.
- D5. If the dish I ate is not listed for that restaurant, I can add it from the dish list (never free text).
- D6. I can change my rating later; my latest rating counts.
- D7. I can flag "not served anymore" or "wrong restaurant".
- D8. I can read a plain-language page on how rankings work and how to dispute.
- D9. Pages load fast on a mid-range Android over 3G and are indexable by Google (SEO).

### Panel
- P1. As a panel member my ratings carry higher weight (admin sets the panel flag).
- P2. I can upload a menu photo for a restaurant; it becomes structured dish rows after admin review.

### Owner
- O1. As an owner I can claim my restaurant (manual verification by admin in v1).
- O2. Once approved I can confirm/remove dishes and fix menu names/prices.
- O3. I can see my dish ranks and vote counts (basic report). Paid report comes later.

### Admin
- A1. I can review Overture Maps candidates one area at a time and create restaurants from a prefilled form (fixing the name, address and area and ticking the dishes they serve), link them to restaurants we have, or skip them; and add a restaurant by hand when Overture misses it. Nothing is public until I create it.
- A2. I can resolve the review queue: unmatched menu items, dish proposals, flags, suspicious bursts, claims.
- A3. I can set user trust, hide ratings, merge duplicate restaurants, mark closed.
- A4. I can trigger a full ranking recompute.

## Screens (routes)

| Route | Purpose | Rendering |
|---|---|---|
| `/` | City picker + launch dish grid + "Rate a dish" CTA | ISR |
| `/[city]` | Dish grid for the city with counts | ISR |
| `/[city]/best-[dishSlug]` | **The ranking page** (SEO target). Eligible list + "not enough votes yet" list | ISR 1h + on-demand revalidate on rating |
| `/[city]/r/[restaurantSlug]` | Restaurant page: dishes ranked, each with score/votes, rate buttons | ISR 1h |
| `/rate` | Rating flow: search restaurant → pick dish → score → optional photo/comment | Client form + server action |
| `/me` | My ratings, edit/delete | Dynamic |
| `/how-rankings-work`, `/dispute`, `/about`, `/privacy`, `/terms` | Trust + legal pages | Static |
| `/owner/*` | Claim, dishes, basic report | Dynamic, role OWNER |
| `/admin/*` | Import, review queue, restaurants, users, recompute | Dynamic, role ADMIN |
| `/api/v1/*` | JSON API (same services) | Route handlers |

## Launch areas (seed/areas.json)

Islamabad: Blue Area, F-6, F-7, F-8, F-10, F-11, G-6, G-7, G-8, G-9, G-10, G-11, G-13, I-8, I-10, E-11, Bahria Town (Islamabad), DHA Phase 2, Bani Gala, Bharakahu.
Rawalpindi: Saddar, Commercial Market, Satellite Town, Bahria Town Phase 1–8, Peshawar Road, Chaklala, Westridge, Gulraiz, Askari, Adiala Road.

## Launch dishes (isLaunch = true)

Chicken Karahi · Mutton Karahi · Chicken Biryani · Beef Nihari · Haleem · Chapli Kabab · Beef Seekh Kabab · Chicken Tikka · Chicken Malai Boti · Beef Burger · Zinger Burger · Pizza · Chicken Shawarma · Broast · Halwa Puri · Kabuli Pulao · Chicken Mandi · Namkeen Gosht · Chai (Doodh Patti)

## Trust rules shown to users

- Rankings use only ratings submitted on DishRank.
- A dish needs enough votes from different people before it gets a rank.
- Newer votes count more than old ones.
- Restaurants cannot pay to change a rank. They can only buy a badge that shows the rank they already have.
- Anyone can dispute via `/dispute`; admin responds within 7 days.

## Success metrics and kill criteria

- Month 2: ≥ 2,000 dish ratings in Islamabad/Rawalpindi from ≥ 300 distinct users.
- Month 2: ≥ 10 dishes with ≥ 5 eligible restaurants each.
- Month 4: ≥ 3 restaurants paying for a report/badge (Phase 7).
- Miss both month-2 targets → stop building features; run as content site or shut down.

## Copy guidelines

- Short, plain words. "Not enough votes yet" not "Insufficient data".
- Never state facts about hygiene or ingredients. Opinions only.
- Show counts next to every score ("8.4 · 23 votes").
