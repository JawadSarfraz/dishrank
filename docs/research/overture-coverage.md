# Overture Maps places: can it seed DishRank's restaurants?

Research note, 2026-10-25. Question: is Overture Maps Places (open data) good enough to seed restaurants
in Islamabad and Rawalpindi instead of Google Places? Short answer: **partly** (verdict at the end). It
is a useful free list of candidate restaurants for an admin to review. It is not clean enough to
publish in bulk, and it says almost nothing about dishes.

## How this was made

- Data: Overture release **2026-10-21.0** (the latest in the STAC catalog), theme `places`, read from
  Overture's public S3 bucket with DuckDB (`@duckdb/node-api`). No Google call, no app DB access.
- Box: every centre in `seed/areas.json` plus 3 km, i.e. west 72.9253, south 33.4955, east 73.2032,
  north 33.7669. The download takes 20–70 s and is 3.3 MB; it stays in `tmp/overture/` (gitignored).
  The south edge passes through Bahria Town Phase 8, so the far south of Bahria and DHA may be cut off
  (`--margin-km=5` would check).
- Rerun: `pnpm research:overture [--release=…] [--margin-km=3] [--refresh]`. It writes every table below
  to `tmp/overture/coverage-<release>.md`.
- **Food and drink** = Overture `taxonomy.hierarchy[1] = 'food_and_drink'`: restaurants, fast food,
  cafes, coffee, tea rooms, bakeries, BBQ, desserts, ice cream and juice. The alcohol branch (41 bars,
  lounges and hookah bars) is left out. Overture files 34 caterers and 46 delivery-only kitchens
  elsewhere, so they are not counted either. 993 places have no category at all and never count;
  about 15 of them have restaurant, cafe or bakery names.
- **City** = city of the nearest seed area centre, if within 3 km. **Area** = nearest seed area centre,
  if within 1.5 km. Seed areas are points, so this is rough:
  - a big area (Bahria Town, DHA) is undercounted;
  - neighbouring sectors that are not in the seed list (E-7, G-5, H-8…) leak into the nearest seed sector;
  - a place near the city line can land in the wrong city.
- **Placeholder points**: 20 spots (rounded to ~10 m) each hold 10 or more places, mostly with different
  addresses. That is a geocoder fallback, not a location. These 3,019 places (120 food) get no city or
  area. The worst is one point in G-7 with 876 places.

## 1. Coverage per city and area

| City | All places | Food and drink | Food, confidence ≥ 0.7 |
| --- | --: | --: | --: |
| Islamabad | 13,278 | 1,541 | 797 |
| Rawalpindi | 8,646 | 902 | 412 |
| Rest of box (> 3 km from seed areas) | 3,445 | 262 | 108 |
| Placeholder coordinates (location unknown) | 3,019 | 120 | 47 |
| **Total** | **28,388** | **2,825** | **1,364** |

The 0.7 cut is our own choice; Overture recommends no threshold (see §4).

| Area | City | All places | Food | Food, conf. ≥ 0.7 |
| --- | --- | --: | --: | --: |
| F-7 | Islamabad | 809 | 170 | 102 |
| F-10 | Islamabad | 578 | 114 | 63 |
| F-6 | Islamabad | 789 | 112 | 66 |
| I-8 | Islamabad | 754 | 108 | 53 |
| F-8 | Islamabad | 618 | 107 | 57 |
| F-11 | Islamabad | 650 | 97 | 49 |
| Bahria Town (Islamabad) | Islamabad | 710 | 88 | 44 |
| DHA Phase 2 | Islamabad | 571 | 87 | 51 |
| E-11 | Islamabad | 483 | 67 | 26 |
| Blue Area | Islamabad | 766 | 61 | 38 |
| G-9 | Islamabad | 553 | 56 | 36 |
| G-11 | Islamabad | 719 | 51 | 18 |
| G-6 | Islamabad | 375 | 39 | 21 |
| Bharakahu | Islamabad | 201 | 28 | 13 |
| G-13 | Islamabad | 297 | 24 | 7 |
| G-10 | Islamabad | 320 | 22 | 12 |
| G-8 | Islamabad | 478 | 21 | 13 |
| I-10 | Islamabad | 392 | 21 | 6 |
| G-7 | Islamabad | 312 | 17 | 9 |
| Bani Gala | Islamabad | 67 | 7 | 3 |
| Commercial Market | Rawalpindi | 1,481 | 154 | 85 |
| Saddar | Rawalpindi | 1,274 | 140 | 70 |
| Bahria Town (Phase 1-8) | Rawalpindi | 770 | 117 | 61 |
| Chaklala | Rawalpindi | 246 | 37 | 20 |
| Westridge | Rawalpindi | 285 | 34 | 15 |
| Satellite Town | Rawalpindi | 381 | 26 | 14 |
| Peshawar Road | Rawalpindi | 164 | 13 | 3 |
| Askari | Rawalpindi | 149 | 12 | 8 |
| Gulraiz | Rawalpindi | 189 | 12 | 2 |
| Adiala Road | Rawalpindi | 74 | 2 | 0 |
| Not within 1.5 km of a seed area | | 9,914 | 861 | 352 |

Places with 85 or more food listings: most F-sectors, I-8, both Bahria Towns, DHA Phase 2, Commercial
Market and Saddar. Thin areas:
- Islamabad: G-7 (17), G-8, G-10, G-13 and I-10 (21–24).
- Rawalpindi: Adiala Road (2), Gulraiz (12), Askari (12) and Peshawar Road (13).

The area counts are only roughly comparable, because Islamabad sector centres are about 2 km apart and
each 1.5 km circle is cut by its neighbours. Dhabas and street-side karahi places without a Facebook
page are probably under-listed; this was not measured, and only 5 food names contain "dhaba".

## 2. Food places by category (top 25)

| Category | Places | Share | Islamabad | Rawalpindi |
| --- | --: | --: | --: | --: |
| restaurant | 891 | 32% | 468 | 295 |
| fast_food_restaurant | 393 | 14% | 201 | 131 |
| cafe | 252 | 9% | 154 | 61 |
| bakery | 173 | 6% | 76 | 70 |
| pizza_restaurant | 139 | 5% | 67 | 44 |
| pakistani_restaurant | 126 | 4% | 79 | 37 |
| coffee_shop | 91 | 3% | 58 | 26 |
| chinese_restaurant | 72 | 3% | 44 | 20 |
| ice_cream_shop | 68 | 2% | 39 | 23 |
| burger_restaurant | 62 | 2% | 38 | 18 |
| asian_restaurant | 55 | 2% | 33 | 15 |
| food_and_drink | 51 | 2% | 25 | 17 |
| barbecue_restaurant | 38 | 1% | 17 | 17 |
| indian_restaurant | 37 | 1% | 20 | 12 |
| dessert_shop | 32 | 1% | 15 | 12 |
| tea_room | 32 | 1% | 17 | 11 |
| breakfast_and_brunch_restaurant | 25 | 1% | 10 | 12 |
| smoothie_juice_bar | 25 | 1% | 14 | 9 |
| steakhouse | 24 | 1% | 15 | 7 |
| sandwich_shop | 19 | 1% | 11 | 6 |
| afghani_restaurant | 16 | 1% | 11 | 4 |
| italian_restaurant | 16 | 1% | 10 | 5 |
| chicken_restaurant | 15 | 1% | 6 | 7 |
| bar_and_grill_restaurant | 14 | 0% | 11 | 2 |
| theme_restaurant | 12 | 0% | 7 | 2 |

The city columns leave out the rest of the box and the placeholder points, so they add up to less than
"Places".

Almost half of the food places (1,335, 47%) carry only a generic label: `restaurant`,
`fast_food_restaurant` or `food_and_drink`. No category in this extract names karahi, biryani, tikka,
seekh or chapli kabab, or dhaba. The nearest is `doner_kebab_restaurant`, with 1 place.

## 3. Launch dishes

This counts places whose **name or category** contains the dish name or one of its aliases from
`seed/dishes.json`.
- Names are cleaned as in docs/05 step 1, and an alias must appear as whole words.
- Each dish is counted on its own. There is no docs/05 step 2 longest-alias contest, so "Karachi
  Biryani and Broast" counts for both dishes.
- Food places only.

This is a lower bound: most places serve a dish without naming it, and Overture has no menus.

| Dish | Name or category match | Islamabad | Rawalpindi | Elsewhere ¹ | Head word only ² | Related category only ³ |
| --- | --: | --: | --: | --: | --- | --- |
| Chicken Karahi | 0 | 0 | 0 | 0 | 24 (karahi) | – |
| Mutton Karahi | 0 | 0 | 0 | 0 | 24 (the same places) | – |
| Namkeen Gosht | 0 | 0 | 0 | 0 | 4 (namkeen) | 16 afghani |
| Chicken Biryani | 40 | 20 | 11 | 9 | – | – |
| Kabuli Pulao | 1 | 1 | 0 | 0 | – | 16 afghani |
| Chicken Mandi | 10 | 7 | 2 | 1 | – | 9 middle eastern (4 are shawarma shops) |
| Beef Nihari | 20 | 4 | 15 | 1 | – | – |
| Haleem | 10 | 4 | 5 | 1 | – | – |
| Beef Seekh Kabab | 0 | 0 | 0 | 0 | 21 (kabab; at most 7 look like seekh) | 52 barbecue / grill |
| Chapli Kabab | 2 | 1 | 1 | 0 | – | 54 barbecue / afghani |
| Chicken Tikka | 0 | 0 | 0 | 0 | 49 (tikka) | 52 barbecue / grill |
| Chicken Malai Boti | 1 | 0 | 1 | 0 | 0 (boti) | 52 barbecue / grill |
| Halwa Puri | 11 | 2 | 6 | 3 | – | 19 breakfast |
| Beef Burger | 102 | 61 | 29 | 12 | – | – |
| Zinger Burger | 0 | 0 | 0 | 0 | – | 15 chicken |
| Pizza | 200 | 95 | 64 | 41 | – | – |
| Broast | 21 | 7 | 10 | 4 | – | 15 chicken |
| Chicken Shawarma | 14 | 9 | 3 | 2 | – | 21 middle eastern / turkish |
| Chai (Doodh Patti) | 25 | 18 | 3 | 4 | – | 25 tea_room |

¹ Rest of the box or placeholder coordinates.
² The name has the dish word but not the meat word ("Butt Karahi", "Sattar Tikka"), so it does not say
which dish. Our karahi and chicken tikka aliases always include the meat word, which is why those three
dishes score 0. Seekh kabab scores 0 because no place name contains "seekh" in any spelling; most of
the 21 "kabab" names are pulao kabab or chapli places. About 14 of the 49 tikka names are Shinwari or
Charsi tikka houses, which usually serve mutton.
³ Places in a related cuisine category that do not name the dish. This is a weak hint: the "chicken"
category includes Nando's and raw-chicken shops.

Neither ² nor ³ is included in the match count.

How good the matches are:
- **Precise:** biryani, nihari, haleem, mandi, broast, shawarma and chai. In a hand check every match
  serves the dish. Two biryani matches are Sindhi or beef biryani.
- **Halwa Puri is loose.** Only 2 of the 11 names say "halwa puri"; the other 9 match the alias "nashta"
  (breakfast), and one of those is a pizza place.
- **Burger is loose.** Pizza and burger are the only dishes any category label matches: 139 places via
  `pizza_restaurant`, 62 via `burger_restaurant`. 7 of the 58 burger name hits are Afghani-burger stalls,
  and the category-only hits include a shoe shop. About 75 of the 102 plausibly sell a beef burger.
- **Mandi rule.** The `mandi` alias skips "mandi" after market words (sabzi, namak, bakar…) and before
  road or more. This removes 3 food hits: "Javed Marriage Hall Bakar Mandi Road" and two Shinwari
  restaurants named after Peshawar's Namak Mandi, which probably serve namkeen gosht.

Missed because the spelling is not one of our aliases:
- **Chai:** about 42 more places, against 25 matched. 19 use other spellings (14 "Chaaye Khana",
  "Chaiwala" ×2, "ChaiQue"…) and 23 are "Tea …" names, mostly Quetta tea cafes.
- **Burger and pizza:** plural "Burgers" (9) and "Pizzeria" (7).
- **Namkeen Gosht:** 54 "Shinwari" places that likely serve it.
- **Kabuli Pulao:** 7 "Kabul…" or "Afghan … Pulao" places.

## 4. Data quality

**Sources.** Almost everything is Meta (Facebook business pages). No place in the box has more than one
whole-record source, so nothing is cross-checked between providers.

| Source | Licence | All places | Food |
| --- | --- | --: | --: |
| meta | CDLA-Permissive-2.0 | 27,596 (97%) | 2,760 (98%) |
| Microsoft | CDLA-Permissive-2.0 | 473 (2%) | 42 (1%) |
| Foursquare | Apache-2.0 | 156 (1%) | 14 (0.5%) |
| AllThePlaces | CC0-1.0 | 83 (0.3%) | 9 (0.3%), all Domino's |
| Uberall | CDLA-Permissive-2.0 | 79 | 0 |
| PinMeTo | CDLA-Permissive-2.0 | 1 | 0 |

**Confidence.** What Overture says about the score:
- it is "a value between 0 and 1 representing the likelihood that the place exists";
- "Confidence measures existence only";
- scores "are not calibrated to be strictly comparable across providers";
- it should be used as "a relative filtering tool rather than a precise probability".

Overture recommends no threshold.

| Confidence | All places | Food | Share of food |
| --- | --: | --: | --: |
| < 0.3 | 3,009 | 201 | 7% |
| 0.3–0.5 | 4,421 | 469 | 17% |
| 0.5–0.7 | 9,495 | 791 | 28% |
| 0.7–0.9 | 8,738 | 967 | 34% |
| ≥ 0.9 | 2,725 | 397 | 14% |

The median is 0.63 for all places and 0.69 for food, so 52% of food places are below 0.7. Low scores
are a mix:
- Facebook-only businesses (home bakers, cupcake pages);
- wrong categories ("A&J Poultry Farm" as `chicken_restaurant`);
- shops that sound like real storefronts ("Cheeky Joe's - F11 Markaz" 0.20, "Pindi Tikka house" 0.20).

We did not check which of them exist.

**Fields filled (food places)**

| Field | Share |
| --- | --: |
| Address (non-empty text) | 92% |
| … of which only two words or fewer ("School Rd", "G-8 Markaz") | 19% |
| Phone | 86% |
| Address and phone | 81% |
| Website, any | 29% |
| Own website (not social, maps or delivery link) | 25% |
| Social link (facebook.com, the page the record comes from) | 98% |
| Website or social link | > 99% (all but 9) |
| Brand (chains) | 11% |
| Locality in Urdu script ("زون 1", "تحصیل راولپنڈی شہر") | 50% |
| A Google Maps link in the website or address | 14 places |

Plus codes are rare (11). Across all places, 126 carry a Google Maps link (see §8).

**How recent.** 98% of food places were updated less than 3 months before the release. But 2,457 of the
2,760 Meta food records carry exactly the same date, 2026-10-12. That is Meta's export stamp, not a
check that the place still trades. Microsoft records date from 2021–2025 and Foursquare from 2020–2026.
`operating_status` is empty for all 2,825 food places, so closed places cannot be filtered out.

**Location**
- 3,019 places sit on placeholder points (see "How this was made").
- 9 food places give a town outside the twin cities as their locality: Karachi ×2, Gujar Khan ×2,
  Lahore, Murree, Attock, Bagh, Keran.
- Some non-food businesses are filed as food: "RK Electronics", "Xarasoft Shoe Shop", "Carter's / Osh
  Kosh" as `american_restaurant`.

**Likely duplicates** (within 50 m, names equal after dropping case and punctuation, Jaro-Winkler ≥ 0.9,
or one name contains the other)

| Scope | Pairs | Places in a pair | Share |
| --- | --: | --: | --: |
| Food | 15 | 30 | 1% |
| All places | 271 | 436 | 2% |

Examples: "KFC" / "KFC" 30 m; "Mc Donalds, F-10, Islamabad" / "McDonald's" 7 m; "MeiKong Chinese
Restaurant" / "Mei Kong" 11 m.

This is a floor. The name test misses the same shop under another name ("OPTP" / "One Potato Two Potato",
20 m) or at a wrong point. Reading the addresses of the 105 known-name records in §5 suggests about 1 in
9 of them duplicates another record. Overture itself says Places "is known to contain duplicates, a high
junk rate, and low property completeness."

**IDs.** Overture reported 11.9% id churn in release 2026-10-21.0, so its `id` cannot be our only link
to a place across releases.

## 5. Known names

**All 12 were found.** A record counts when its name, with case, spaces and punctuation removed, contains
the name or a listed spelling, in any category. A Jaro-Winkler ≥ 0.92 word match on food places also
catches typos.

The notes column comes from reading the records' addresses by hand; Overture does not link duplicates
for us.

| Name | Records | Where (seed area within 1.5 km; "+n outside" = farther) | Notes |
| --- | --: | --- | --- |
| Savour Foods | 5 | Blue Area, Peshawar Road, Commercial Market, +2 outside | One more record spelled "Saver food" duplicates the College Road one. Another is at the Pindi Cricket Stadium food street (Rawalpindi side), but its nearest centre is I-8. |
| Kabul Restaurant | 2 | F-7, Bahria Town (Islamabad) | F-7 is clearly it (`afghani_restaurant`, 0.99, F-7 Markaz). The Bahria one is the same name, not confirmed as a branch. |
| Chaaye Khana | 14 | F-6, F-8, F-11, I-8, DHA Phase 2, Bahria Town (Phase 1-8), Saddar, Commercial Market, +4 outside, 2 on placeholder points | 1 more branch spelled "Chai Khana" (Bahria, chaayekhana.com). "Quetta Chaye Khana F7" is a different business. |
| Cheezious | 10 | F-7, F-11, I-8, Saddar, Commercial Market, +2 outside, 3 on placeholder points | About 8 branches. 2 placeholder records repeat the Commercial Market and F-11 ones; the third gives a Bahria Phase 7 address. |
| Ranchers | 6 | I-8 ×2, Saddar, F-11, Bahria Town (Islamabad), 1 on a placeholder point | 4 outlets. Both I-8 records are in Time Square Plaza. The placeholder record has the Saddar shop's address. |
| OPTP | 18 | DHA Phase 2 ×3, F-11 ×2, F-6, F-7, F-8, G-11, I-8, Bahria Town (Islamabad), Chaklala, Commercial Market, +5 outside | About 14 outlets. The F-6 record's address is Giga Mall (DHA), so its point is wrong. F-11 has 3 records for one shop. |
| Howdy | 3 | F-7, F-8, DHA Phase 2 | |
| KFC | 13 | Bahria Town (Islamabad) ×2, E-11, F-6, F-8, F-10, F-11, I-8, DHA Phase 2, Saddar, Commercial Market, Chaklala, Bahria Town (Phase 1-8) | 12 outlets: the two Bahria records are 31 m apart. |
| McDonald's | 11 | DHA Phase 2 ×2, F-10 ×2, Westridge ×2, F-8, Chaklala, Bahria Town (Islamabad), +2 outside | About 9 outlets. F-10 ×2 is one outlet (7 m apart). One "Westridge" record gives an F-9 address. The fuzzy hit "Macdonald Kashmir Highways" is a third record of the Srinagar Highway outlet. "Macdonald Barahkoh" (no address) is unconfirmed. |
| Hardee's | 4 | F-8, DHA Phase 2, Bahria Town (Islamabad), Saddar | |
| Butt Karahi | 18 | G-10, G-13, F-8, F-10, I-8, Saddar, Gulraiz, both Bahria Towns, +9 outside | About 17 places, a common shop name. Two small chains: "Butt Karahi By Usman Tahir" ×4 and "Desi Butt Karahi" ×4. |
| The Rome Cafe | 1 | I-8 | I-8 Business Hub, theromecafe.com. |

What this shows:
- Overture knows the chains and the well-known names.
- About 1 record in 9 is a duplicate.
- 6 of the 105 records sit on placeholder points.
- These are mostly chains with Facebook pages, which is where Meta's data is strongest, so they say
  little about small independent places.

## 6. Sample: 30 food places from F-6, F-7, Blue Area, G-9 and I-8

Six per area, in a fixed pseudo-random order (`md5(id)`), so a rerun of the same release gives the same
list. Places on placeholder points are left out.

| Area | Name | Category | Confidence | Source |
| --- | --- | --- | --: | --- |
| F-6 | Munchies Snack Bar | restaurant | 0.80 | meta |
| F-6 | Nations Bakes | dessert_shop | 0.16 | meta |
| F-6 | Akhtar Cafe | cafe | 0.65 | meta |
| F-6 | Tangelo's Cafe & Grill | restaurant | 0.46 | meta |
| F-6 | Urla Bistro | restaurant | 0.86 | meta |
| F-6 | Cheese Cake Cafe | restaurant | 0.75 | meta |
| F-7 | Shahi Refreshment and Kulfi | dessert_shop | 0.48 | meta |
| F-7 | Coffee Lucio | cafe | 0.43 | meta |
| F-7 | Pan Corner | food_truck_stand | 0.79 | meta |
| F-7 | Delicious Xinjiang Restaurant | chinese_restaurant | 0.76 | meta |
| F-7 | Sugar Rush | ice_cream_shop | 0.82 | meta |
| F-7 | Carter's / Osh Kosh | american_restaurant | 0.59 | meta |
| Blue Area | Zaffron Foods | restaurant | 0.76 | meta |
| Blue Area | Burning Brownie | cafe | 0.84 | meta |
| Blue Area | Rahat De Pizza | pizza_restaurant | 0.64 | meta |
| Blue Area | Favour Food | fast_food_restaurant | 0.53 | meta |
| Blue Area | Dilli Darwaza - The Nihari Shop | pakistani_restaurant | 0.87 | meta |
| Blue Area | BunBurry Express | tea_room | 0.90 | meta |
| G-9 | Quetta Commercial Café Ahmad Khan | asian_restaurant | 0.66 | meta |
| G-9 | Anthology Cafe | coffee_shop | 0.24 | meta |
| G-9 | Javed Sweet and Bakers | bakery | 0.82 | meta |
| G-9 | Malang Jan Bannu Beef Pulaoo | restaurant | 0.40 | meta |
| G-9 | Janan Foods Bannu Beef Pulao | restaurant | 0.93 | meta |
| G-9 | Khyber Afghan Restaurant | restaurant | 0.79 | meta |
| I-8 | Crusteez I-8 | cafe | 0.60 | meta |
| I-8 | Juice Land | restaurant | 0.71 | meta |
| I-8 | Ta'am Al Arab | restaurant | 0.45 | meta |
| I-8 | New Quetta Pakistan Cafe | cafe | 0.80 | meta |
| I-8 | ShaknBurg | restaurant | 0.30 | meta |
| I-8 | Afghan Wraps & Fries i-8 Markaz | fast_food_restaurant | 0.63 | meta |

- 29 of the 30 names sound like food or drink businesses. "Pan Corner" is probably a paan stall.
- "Carter's / Osh Kosh" is a children's clothing shop filed as a restaurant.
- We did not check that any of them exist or still trade.

## 7. Licence and attribution

Sources: [docs.overturemaps.org/attribution](https://docs.overturemaps.org/attribution/) (Places section,
read 2026-10-25) and Overture's places guide. The places theme has no single licence; each record carries
its source's licence in `sources[].license`. It contains no OpenStreetMap data, so the ODbL share-alike
rule does not apply.

| Source | Licence | Credit line on Overture's attribution page (verbatim) |
| --- | --- | --- |
| Meta | CDLA Permissive 2.0 | Data from Meta. Available under CDLA Permissive 2.0. |
| Microsoft | CDLA Permissive 2.0 | Data from Microsoft. Available under CDLA Permissive 2.0. |
| Uberall, PinMeTo (no food places here) | CDLA Permissive 2.0 | Data from Uberall. Available under CDLA Permissive 2.0. (same pattern for PinMeTo) |
| Foursquare | Apache 2.0 | Data from Foursquare. Copyright 2024 Foursquare Labs, Inc. All rights reserved. Available under Apache 2.0. Foursquare data was transformed to the Overture schema. Changed: 2026-03-18. NOTICE.txt. |
| AllThePlaces | CC0 1.0 | Data from AllThePlaces. Available under CC0 1.0. |

Overture's own citation is optional and meant for publications: "Overture Maps Foundation,
overturemaps.org", with the date the data was accessed.

What the licences ask of us:
- **CDLA Permissive 2.0** covers Meta and Microsoft: 2,802 of 2,825 food records (99%). We may use,
  change and share the data.
  - When we share the data itself, e.g. by showing names or pins on the site, we must "make available
    the text of this agreement with the shared Data" (§2.1). A link to the licence text next to the
    credit is the usual way, though the licence does not say a link is enough.
  - There is no share-alike and no limit on how long we store the data.
  - "Results" carry no conditions (§3.1). For us, a Result would be the area we work out from Overture
    coordinates. Our rankings come from our own ratings, not from Overture.
- **Apache 2.0** covers Foursquare (14 food places). We must keep the copyright line, ship the licence
  and Foursquare's NOTICE.txt, and say that we changed the data. Simplest is to leave these 14 out.
- **CC0** covers AllThePlaces (9 food places, all Domino's). It sets no conditions, but AllThePlaces
  describes itself as "a growing set of web scrapers". Using it goes against rule 1 (no scraping), so
  leave it out.

**Credit line to show** (footer link to an about page), if we import only Meta and Microsoft records.
These are Overture's lines word for word, plus its optional citation:

> Overture Maps Foundation, overturemaps.org (release 2026-10-21.0, accessed 2026-10-25).
> Data from Meta. Available under [CDLA Permissive 2.0](https://cdla.dev/permissive-2-0/).
> Data from Microsoft. Available under [CDLA Permissive 2.0](https://cdla.dev/permissive-2-0/).

Place names in this report: Overture Maps Foundation, overturemaps.org (release 2026-10-21.0, accessed
2026-10-25).
- Data from Meta. Available under [CDLA Permissive 2.0](https://cdla.dev/permissive-2-0/).
- Data from Microsoft. Available under [CDLA Permissive 2.0](https://cdla.dev/permissive-2-0/).
- Data from Foursquare. Copyright 2024 Foursquare Labs, Inc. All rights reserved. Available under
  [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0). Foursquare data was transformed to the
  Overture schema. Changed: 2026-03-18. [NOTICE.txt](https://opensource.foursquare.com/places-notice-txt/).

## 8. Verdict: partly

**Good enough to seed a candidate list for admin review. Not good enough to publish in bulk, and no help
with dishes.**

Why it helps:
- **Licence.** It lets us store names, addresses and coordinates for good, and work out an area from
  Overture's coordinates. Google's limits do not apply, but our rule 2 (humans type names) still does
  until we change it.
- **Coverage.** 2,825 food places in the box: 1,541 in Islamabad, 902 in Rawalpindi.
- **Known names.** All 12 were found, mostly in plausible areas.
- **Fields.** 92% have some address text (19% only a road or market name) and 86% a phone number.

Why not bulk:
- **One source, unchecked.** 98% comes from Meta (Facebook pages), with no second source to confirm it.
  52% of food places are below 0.7 confidence, and these include home bakers and some non-food shops.
- **Bad locations.** 120 food places sit on placeholder points. Chain records show roughly 1 duplicate
  in 9 that a name check misses.
- **No closed-place signal.** `operating_status` is empty, and "updated" is only Meta's export date.
- **Thin where DishRank needs depth.** Outer Rawalpindi areas have 2–13 food places each, and G-7, G-8,
  G-10, G-13 and I-10 have 17–24.
- **No dishes.** Overture has no menus. Six dishes appear in 20 or more place names: pizza 157, burger
  58, biryani 40, chai 25, broast 21, nihari 20. Karahi (24 names) and tikka (49) appear without the meat
  word, so a name cannot say which karahi. No name contains "seekh". `RestaurantDish` still has to come
  from the panel, menu photos and owners.

What this does not measure: how many real food places are missing, and how many listed ones are closed
or fake. One check would settle that before choosing bulk over review: walk two markets, e.g. F-7 Jinnah
Super and Saddar Bank Road, or ask the panel to. List every food place there, then count how many
Overture has and how many of its entries there still trade.

**How I would import it (admin review, not bulk; not built):**
1. **Refresh.** Rerun this script monthly for the new release. Keep the food places, drop AllThePlaces
   and Foursquare records and places we already have, and collapse the 50 m duplicates. Don't set a
   confidence cut-off yet: sort each area's batch by confidence and set one only after the first review
   shows where the junk starts. A ≥ 0.5 cut would drop 670 food places (24%) unseen.
2. **Stage candidates.** Load them as candidates (a staging table or a `ReviewItem` kind) with the
   Overture id, name, category, coordinates, source, licence and release.
   - Drop any website or address that is a Google Maps link (126 records carry one).
   - Mark placeholder-point places "location unknown".
3. **Admin review.** Admins review one area at a time, in batches:
   - type (or, if rule 2 changes, confirm) the signboard name and address, with Overture's shown as a hint;
   - check the area suggested from Overture's coordinates;
   - merge with an existing restaurant if needed;
   - optionally link a Google place through the existing live search, which stores only the place id
     and refreshed coordinates. The Google result must not be used to confirm, correct or filter
     Overture's name, address, category or coordinates.
4. **Dish candidates.** Only precise name matches (biryani, nihari, haleem, mandi, broast, shawarma,
   chai) may suggest a `RestaurantDish` with status `CANDIDATE`, for the admin to accept. They never rank
   without votes. Skip "nashta" and bare "burger". The app's own matcher (docs/05 step 2) gives one dish
   per name, so its results differ slightly from §3.
5. **Later releases and credit.** Re-match on later releases by name and distance, not only by Overture
   id. Show the credit line from §7.

> Decided by the owner on 2026-10-25 (docs/OPEN-QUESTIONS.md, docs/02 ADR-13): Google Places is dropped;
> Overture-created restaurants keep Overture's coordinates; the Create form may prefill from Overture (rule 2
> rewritten); only Meta and Microsoft records are used. Built as `pnpm overture:sync` and /admin/import
> (docs/07 §1–2).

Decisions for you before an import (this task commits only the script and this report, so they are not
in `docs/OPEN-QUESTIONS.md` yet):
- **Rule 2 and prefill.** Rule 2 sits under the Google data policy, but its wording ("restaurant name,
  address, phone are typed by a human") covers every source. Should an admin form be prefilled from
  Overture? The licence allows it.
- **Coordinates.** May Overture coordinates suggest the area and be stored as our own restaurant
  coordinates, while Google-linked restaurants keep Google's refreshed ones? That means two kinds of
  coordinates with different rules.
- **Sources.** Drop AllThePlaces as scraped data (recommended), and either drop Foursquare or carry its
  Apache notice.
