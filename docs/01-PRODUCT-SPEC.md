# 01 — Product spec (v1)

## Name

Kahan Khayen (Urdu کہاں کھائیں, "where should we eat?"), since 2026-11-06; DishRank before that.
Tagline "Har dish ka pehla number" with the English line "Restaurants ranked dish by dish, by people
who ate there." Internal identifiers stay `dishrank`.

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
- D1a. Home leads with one featured vote (2026-11-11). Per city an admin sets one or two featured dishes, a round name and the day voting for the round's results closes (end of that day, Pakistan time), on /admin/rankings; the seed features chicken karahi and mutton karahi in both cities, "winter results", closing Sunday 20 December 2026. The home page and the city page open with "Open for voting": the featured dishes as large cards, the headline uses the first one ("Where's the best chicken karahi in Islamabad?"), and a line says "Voting for the winter results closes Sun 20 Dec"; the same line sits under the title of each featured dish's page. After the day has passed the line disappears, nothing else changes: a ranking never closes. Below, "More dishes" is the smaller grid of the other dishes with at least one contender, and "Coming next" groups the dishes with no contenders yet as chips with "Tell us which places should be on the list" (the suggest-a-restaurant form).
- D2. I can filter by area and sort by score / votes / price, or by distance when I share my location (our own restaurant coordinates).
- D3. I can open a restaurant page and see all its dishes with scores, best dish first.
- D1b. Source tags (2026-11-11). A short tag on any landing URL (`?s=wa`, `?s=rd`, `?s=ig`, `?s=li`, `?s=fb`, `?s=qr`; lowercase letters and digits, 12 at most) says which channel brought the visit. The browser keeps the first tag in a first-party cookie for 7 days (`dishrank_source`, the tag only; a session cookie until 2026-11-13; the pages stay static, canonical URLs never carry it), its events carry it, and it is saved once on the account at sign-up (`User.source`). Whoever joins by a panel invite link gets the link's label as their source. The site's own Share buttons add `s=share`. `/admin/analytics` shows, per week and source: visits to dish pages, new raters (the week of an account's first counted rating, by its source) and ratings (by the rater's source). A tag is a channel, never a person; the privacy page says so.
- D1c. Indexing (2026-11-11). A dish page is indexable, and in the sitemap, once three restaurants rank on it; a restaurant page once one of its dishes ranks (`INDEX_RULES`, `src/lib/indexing.ts`). Thinner pages are `noindex, follow`: still linked, still crawled. The public pages ship no `loading.tsx`, so the first HTML carries the title and the content before the footer. A phone number shows only on a listing a person has checked or an owner has claimed.
- D2a. Before a dish ranks anywhere, its page still helps: "Contenders" lists the places on its list that nobody has rated yet, in an order shuffled on the server at each render of the page (never A to Z: the top row would collect votes just for being on top), with area and Near me filters, a Rate button, "Show more" and "Missing one? Add it", which opens the rate flow's suggest-a-restaurant form. A place is on a dish's list (a contender, 2026-11-11) only when it ranks for the dish, or has a counted rating for it, or its listing was checked by a person (created by hand, or auto-listed and marked "Looks right" or edited by an admin) with the dish ticked; auto-listed places that only match by a word in their name or category stay off every list, the quick-rate list and the home counts, but search and the rate flow still find them. An admin curates one dish in one city on /admin/contenders. The home dish grid says "N contenders" where nothing ranks yet. While "Rate the places you know" is open it stands in for the page's lists, so no place appears twice. Until something ranks, the page says how close it is, in the same unit as its badge: "2 of 4 raters so far for the first ranked Pizza in Islamabad", from the live thresholds and the place closest to a rank. When enough people have rated but the weight bar is not met, it says "A few more ratings for the first ranked Pizza in Islamabad".
- D4. I can search a restaurant (Roman Urdu tolerant) and rate a dish there in under 30 seconds on my phone.
- D4a. On a dish page, "Rate the places you know" lists the places in that city that serve it and I can score several on one screen, one tap per score, or search for one that isn't listed. It asks me to rate only places where I've had the dish. Every score goes through the same RatingService, with all its rules and limits. A rating I gave earlier is changed in the full form, so its comment and photo are not lost. Signed out I see the same list: my tap opens the rate flow's score step with that score filled in (`?score=8`), I sign in with Google there, I come back to the same step with it still filled in, and one tap submits it. From the success step, "Rate more places for <dish>" takes me back to the list.
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
- A1. I can review Overture Maps candidates one area at a time and create restaurants from a prefilled form (fixing the name, address and area and ticking the dishes they serve), link them to restaurants we have, or skip them; and add a restaurant by hand when Overture misses it. Nothing is public until it is created.
- A1a. I can run Auto-list on /admin/import: a dry run with counts per city, area and category, then Apply creates the clear candidates in one go, safe to run again, never touching a restaurant that exists. On /admin/restaurants, "Auto-listed, not checked" lets me spot-check them (docs/07 §2a).
- A2. I can resolve the review queue: unmatched menu items, dish proposals, flags, suspicious bursts, claims.
- A3. I can set user trust, hide ratings, merge duplicate restaurants, mark closed.
- A4. I can trigger a full ranking recompute.

## Screens (routes)

| Route | Purpose | Rendering |
|---|---|---|
| `/` | City picker + featured dishes ("Open for voting") + the other dishes with contenders + "Coming next" | ISR |
| `/[city]` | The same for the city, with counts | ISR |
| `/[city]/best-[dishSlug]` | **The ranking page** (SEO target). Eligible list + "not enough votes yet" list | ISR 1h + on-demand revalidate on rating |
| `/[city]/r/[restaurantSlug]` | Restaurant page: dishes ranked, each with score/votes, rate buttons | ISR 1h |
| `/rate` | Rating flow: search restaurant → pick dish → score → optional photo/comment | Client form + server action |
| `/me` | My ratings, edit/delete | Dynamic |
| `/how-rankings-work`, `/dispute`, `/about`, `/privacy`, `/terms` | Trust + legal pages. `/about` also says who runs the site and how to reach them (`OPERATOR_NAME`, `CONTACT_EMAIL`), why it exists, and that we earn nothing today: no restaurant has paid, nobody can pay to change a ranking (2026-11-11) | Static |
| `/owner/*` | Claim, dishes, basic report | Dynamic, role OWNER |
| `/admin/*` | Import, review queue, restaurants, users, recompute | Dynamic, role ADMIN |
| `/api/v1/*` | JSON API (same services) | Route handlers |

## Launch areas (seed/areas.json)

Islamabad: Blue Area, F-6, F-7, F-8, F-10, F-11, G-6, G-7, G-8, G-9, G-10, G-11, G-13, I-8, I-10, E-11, Bahria Town (Islamabad), DHA Phase 2, Bani Gala, Bharakahu.
Rawalpindi: Saddar, Commercial Market, Satellite Town, Bahria Town Phase 1–8, Peshawar Road, Chaklala, Westridge, Gulraiz, Askari, Adiala Road.

## Launch dishes (isLaunch = true)

Chicken Karahi · Mutton Karahi · Chicken Biryani · Beef Nihari · Haleem · Chapli Kabab · Beef Seekh Kabab · Chicken Tikka · Chicken Malai Boti · Beef Burger · Zinger Burger · Pizza · Chicken Shawarma · Broast · Halwa Puri · Kabuli Pulao · Chicken Mandi · Namkeen Gosht · Chai (Doodh Patti)

## Trust rules shown to users

- Rankings use only ratings submitted on Kahan Khayen.
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
