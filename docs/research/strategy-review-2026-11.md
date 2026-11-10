# Kahan Khayen: strategy review, November 2026

*Written on 11 November 2026 by Claude (Fable 5.2) for Jawwad Bin Sarfraz. Scope: product, plan, market, traffic, SEO, design, marketing, product gaps, business model, and a 7 / 30 / 90-day plan.*

**How to read the labels.** *Fact* means a linked source says it. *Estimate* means my arithmetic, with the assumptions shown. *Judgement* means my opinion. Confidence is high, medium or low.

**What I could and could not check.**

- **No repo access.** I did not read CLAUDE.md, docs/ or the earlier reviews. I judge the earlier advice by the plan you described.
- **Live site.** I read the public pages as text on 11 November. No JavaScript, no raw HTML, no headers, no JSON-LD. `/rate` and `/sign-in` are blocked by robots.txt, so I did not see the rating or sign-in screens.
- **Screenshots.** Ten, all desktop. Phone points are checks, not findings.
- **Search results.** Checked on a US-based search engine, not Google Pakistan. The Maps pack and AI Overviews were not visible.
- **Search budget.** The session's web-search budget ran out part-way through the research. Items marked "not found" may exist. A follow-up could close the main gaps: real search volumes, names and sizes of twin-city Facebook groups, Reddit rules, food-creator rates, and Pakistani legal cases.

---

## One-page summary

### Verdict

**A well-made product with no proof of demand yet.**

- **The idea is sound.** Nobody in Pakistan ranks restaurants per dish from diners' own ratings today. The question ("best X kahan milti hai?") is asked every day. Trust in paid food content is low.
- **The risk is not the product. It is the cold start.** One user, three ratings, 38 empty lists, one person, 7–8 hours a week. Every similar product abroad that lasted seeded its first city by hand. Every similar product in Pakistan pivoted or faded.
- **The plan has the right order and the wrong numbers.** 300 raters by early January is almost three times my base case. It also spreads effort too thin, gives raters nothing back, and never mentions Ramadan.
- **Timing is fine, with one hard date.** Ramadan should start around 8 February 2027. Sehri and iftar lists must be live by 25 January.
- **The first screen needs fixing before any stranger sees it.** The karahi list is seven places called "Butt Karahi". Every page, and every WhatsApp preview, says "nothing here".

### Chances (my judgement)

| Outcome | Chance |
|---|---|
| It stalls (under about 150 raters at six months) | about 50% |
| Alive at six months (300+ raters, 8+ live boards) | about 35% on today's plan, about 45% with the changes below |
| Growing without your daily push at twelve months (1,500+ raters, 5,000+ visitors a month) | about 10–12% |
| A real income within two years (PKR 150,000+ a month) | about 3–5% |

Base case numbers: about 180 raters and 800 ratings by 10 February; about 450 raters by May; about 1,350 raters and 6,000–10,000 visitors a month by November 2027; little or no revenue in year one.

### Top 10 recommendations, by impact for effort

| # | Do this | Effort |
|---|---|---|
| 1 | Fix the contender lists before anyone sees them: curated, checked, renamed "Contenders", shuffled | 3 h per dish |
| 2 | Stop announcing emptiness: rewrite six lines and the WhatsApp preview; feature one or two dishes on the home page | 2 h |
| 3 | Reset the targets: 100 raters, 500 ratings, 3 live boards by 10 January. Drop the April revenue goal. | 0 h |
| 4 | Run a public vote with a closing date, not a platform launch: "Islamabad's best karahi. Voting closes 20 December." | Wording and one page |
| 5 | Recruit 50 food-obsessed people one by one. Earn trust weight by behaviour; do not hand out 1.3 by invite link. | 4 h a week, two weeks |
| 6 | Launch with "our first 30 raters say X. Wrong? Fix it" on r/islamabad, r/developersPak, LinkedIn and WhatsApp status | 3 h per post |
| 7 | Add source tags now. Measure sign-in from social apps. If under 30% finish, add a six-digit email code. | 2 h, then 3–5 h |
| 8 | Give raters something back: a "My top 3" share card and an earned "Trusted taster" level | 4–6 h |
| 9 | Plan backwards from Ramadan: campus vote 18 January to 7 February; sehri and iftar lists by 25 January | Planning |
| 10 | Add real photos in this order: covers by you and your founding raters, then approved diner photos. No AI food. | 3–5 h |

The detailed sections follow in the order you asked for. Sources are linked where they are used and listed again at the end.

---

## 1. Where we stand

### 1.1 The product

**Verdict: a well-made product with no proof of demand yet.** The idea is sound. The build is better than it needs to be. Nothing has been tested with a stranger.

What is strong:

- **The insight is right.** People here choose a dish, then a place. "Best X kahan milti hai?" is already the most common question in food groups. You are giving a daily habit a permanent home.
- **The promise is clear and rare.** Only diners' ratings. Nothing imported. Nothing for sale. In a city where only a third of people trust food vloggers (section 2.1), that is a real position.
- **The engineering is solid.** Fast pages, clean URLs, honest data credits, abuse rules, backups, an admin most projects add a year too late.

What is weak:

| Weakness | Why it matters now |
|---|---|
| The site is a container, and it is empty. | 1 user, 3 ratings, 0 ranked places. Every page says so. |
| The first screen fails the "does this site know my city?" test. | The karahi list is seven places called "Butt Karahi". The biryani list misses most places locals would name. |
| Raters get nothing back. | No personal list, no status, nothing to share about themselves. The products that got free ratings at scale gave the first user value alone (section 2.3). |
| Most social traffic cannot sign in without an extra step. | Google blocks its sign-in inside the Facebook, Instagram, Messenger and TikTok browsers. That is where local food talk lives. |
| The effort is spread over 38 lists. | 19 dishes × 2 cities, with one person and 7–8 hours a week. |
| Chains split votes. | Five of your 19 launch dishes (pizza, zinger, burger, broast, shawarma) are chain-heavy. |

One more honest point. In three weeks you built an owner dashboard, menu reading, trust weights, a review queue and a dispute flow. All of it before user number two. That is not a quality problem. It is a signal about where your effort goes by default. Building is the easy part for you. The hard part has not started.

### 1.2 The plan

The order of your plan is sensible. The numbers are not. The surface is too wide. And it reaches the audiences that matter too late.

| Plan item | Verdict | What I would change |
|---|---|---|
| Tick chicken karahi on ~15 known places and mark them checked | **Keep. Do it first.** | Also hide unchecked name-matched places from the list. Do both cities. Rename the list "Contenders". |
| Test an invite link with family; test the in-app browser step | **Keep** | Test on a real Android phone from Facebook, Instagram, TikTok and LinkedIn. Write down how many taps it takes. |
| Friends round with invite links (20 uses each) that make friends "panel" raters | **Change** | Ask one-to-one, not by group blast. Pick food-obsessed people, not just friends. Do not give the top weight (1.3) through a link that can be forwarded. |
| One dish a week (karahi, then nihari) | **Change** | One headline dish for four to five weeks, run as a vote with an end date. Open the second dish in week three. |
| When 3 places rank: friends share on WhatsApp; you post on r/islamabad and r/PakStartups | **Keep, with a better hook** | Post the early ranking and ask people to fix it ("Our first 30 raters say X. Tell us why they're wrong."). Add r/developersPak and LinkedIn with the build story. I could not confirm r/PakStartups is active. |
| QR counter cards at 3–5 ranked places from week 2 | **Delay and reshape** | Too early, and unfair: places with cards will outrank places without. Your burst rule will also hold most of these ratings. Pilot at two places in December. Later, give cards to *every* contender of the featured dish. |
| Facebook groups after 3 ranked places for 3 days, the phone test, and a lawyer | **Rethink the approach** | Groups ration promotion. Plan on taking part and on one admin partnership, not on a link post. Do the lawyer in parallel; do not wait for it. |
| Build nothing for 2 weeks | **Keep the spirit** | Allow a handful of small fixes that decide whether your first 100 visitors stay (section 10.1). |
| "My top 3" card later, only if needed | **Bring forward** | It is the sharing loop. Build it right after the first round. |
| Campus push from late January | **Move** | Classes restart 18–25 January. Ramadan starts around 8 February. The clean campus window is three weeks. Plan for it now. |
| Targets: 2,000 ratings from 300 raters by early January | **Reset** | 100 raters, 500 ratings, 3 live lists by 10 January (section 2.5). |
| 3 paying restaurants by mid-April | **Drop** | No revenue target until 1,000 raters (section 8). |
| Warning sign: fewer than 10 new non-panel raters a week for 2 weeks | **Keep, and add rates** | Also watch conversion: if fewer than 2% of browser visitors rate, the product is the problem, not the channel. |

### 1.3 The timing

**Timing is fine, with one hard date.**

- Winter is the right season for karahi, nihari, haleem and chai.
- University finals run from mid-December to early January, so students are a January audience, not a December one.
- **Ramadan should begin around 8–9 February 2027, with Eid around 9–11 March** (a forecast until the moon is sighted; [Daily Pakistan](https://en.dailypakistan.com.pk/02-Sep-2026/ramadan-2027-to-start-on-february-8-check-first-roza-eid-dates), [Wego](https://blog.wego.com/pakistan-ramadan-timetable/)). Publishers refresh their iftar and sehri pages every year because that is when people search ([one example](https://en.dailypakistan.com.pk/26-Feb-2026/top-iftar-buffet-deals-in-islamabad-to-try-in-ramadan-2026)). It is the biggest predictable food moment of the year, and it lands exactly at your 90-day mark. Treat it as your first real deadline: sehri and iftar lists live by 25 January. Miss it and the next one is in January 2028.
- A slower clock: search is moving towards AI answers, which reward sources with original numbers (section 4.7). A real first-party dataset ages well. An empty one does not.

### 1.4 The earlier advice

I could not read the earlier Opus and Fable reviews, because I had no access to your repo. I judge them by the plan they produced.

**What they got right:** the order of steps; gates before each public push; "build nothing"; a named warning sign; a non-panel share target; caution about legal pages.

**What I think they got wrong:**

1. **The numbers.** 300 raters in eight weeks from zero is an outcome for a funded team or a viral post, not a base plan.
2. **Friends as a weighted panel.** It makes your first rankings your friends' taste, counted at 1.3. Trust should be earned by behaviour.
3. **QR cards early.** They bias the ranking towards whoever has a card, and they collide with your own burst rule.
4. **Revenue by April.** The one local precedent that sold a guide to restaurants lost its renewals because it could not prove the business it sent (section 2.2).
5. **Facebook groups as a place to post.** They are communities with rules and gatekeepers.
6. **No return loop.** Nothing in the plan gives a rater a reason to come back or to share something about themselves.
7. **The calendar.** Nothing in the plan mentions Ramadan.

## 2. Market research and chances of success

### 2.1 How people in Islamabad and Rawalpindi decide where to eat

**First, the size of the audience.**

| Measure | Number | Type | Source |
|---|---|---|---|
| Islamabad Capital Territory, 2023 census | 2.36 million (1.11 million urban) | Fact, high | [PBS census report](https://www.pbs.gov.pk/sites/default/files/population/2023/reports/District%20Census%20Report%202023-Islamabad.pdf) |
| Rawalpindi city, 2023 census | 3.36 million | Fact, medium | [Wikipedia, citing PBS](https://en.wikipedia.org/wiki/Rawalpindi) |
| Twin cities today | about 6.1 million | Estimate, medium (census growth rates carried forward) | — |
| Internet users in the twin cities | 3.3–4.6 million | Estimate, low (57% to 80% of 5.7 million; no city figure is published) | — |
| Realistic first-year audience: online, urban, aged 18–34 | 1–1.5 million | Estimate, low | — |
| Internet users, Pakistan, Oct 2026 | 149 million (57.3%) | Fact, high | [DataReportal Digital 2027](https://datareportal.com/reports/digital-2027-pakistan) |
| Ad reach, Pakistan: TikTok / YouTube / Facebook / Instagram | 94.1m / 60.6m / 50.3m / 24.3m | Fact, high | same |
| Facebook audience trend and mix | down 5% in a year; 81% male | Fact, high | same |
| WhatsApp accounts, Pakistan | about 100 million | Fact, medium (regulator's briefing, via press) | [Bol News](https://bolnews.com/technology/pakistan-leads-global-youtube-race-with-560-million-daily-views) |
| Android share of mobile; Google share of search | 91.6%; 95.1% | Fact, high | [StatCounter OS](https://gs.statcounter.com/os-market-share/mobile/pakistan), [StatCounter search](https://gs.statcounter.com/search-engine-market-share/all/pakistan) |
| Restaurants and hotels in household spending | 6.63%, about Rs 5,250 a month for the average household | Fact, high; rupee figure is an estimate | [Dawn on HIES 2024-25](https://www.dawn.com/news/1964568) |

Two things follow. Design and test for Android and Chrome first. And each household has only a handful of restaurant meals a month, so your rating volume will depend on how many people you reach, not on how often each one eats out.

**Then, the channels people actually use.**

| Channel | How it is used | Evidence | Its weak spot |
|---|---|---|---|
| Friends, family, office and WhatsApp groups | The first and most trusted stop. | WhatsApp is the platform Pakistanis say they use most (27%, [IPOR survey, Aug 2025](https://ipor.com.pk/uploads/68b54b0f2e3b4.pdf)). In a twin-cities study of about 250 coffee-shop customers, word of mouth was the strongest driver and brand-run social media had no significant effect ([Jinnah Business Review](https://jbr.cust.edu.pk/volumes/Ariticle-10-2-8.pdf)). | Small circle. Nothing is saved. Not searchable. |
| Google Maps | The default check on any place. The deepest pool of free reviews. | Savour Foods Blue Area shows about 71,400 Google reviews against 132 on Tripadvisor; Monal 54,330; Howdy 20,567. Fifty well-known Islamabad places carry about 331,000 between them ([Wanderlog snapshots of Google data](https://wanderlog.com/list/geoCategory/319341/)). | Stars are for the whole restaurant. Dish opinions are buried in review text. |
| Facebook food groups | Ask "best X?", get answers in minutes. | Press since 2013 documents the habit and says forums can "make or break" a restaurant ([Friday Times](https://thefridaytimes.com/14-Aug-2015/the-hunger-games), [Express Tribune](https://tribune.com.pk/story/2037608/entertainment)). Facebook sends 86.6% of social referrals in Pakistan ([StatCounter](https://gs.statcounter.com/social-media-stats/all/pakistan)). | Unverifiable reviews, owner-linked praise, admin cliques ([Dawn](https://www.dawn.com/news/1184141)). No memory: the same question returns every week. I found no published data on Islamabad groups specifically. |
| Instagram, TikTok, YouTube creators | Discovery of new places. | #FoodTok searches in Pakistan rose 52% in 2025 ([Dawn](https://www.dawn.com/news/1963121/travel-food-dominate-tiktok-searches-in-2025)). | Trust. In a survey of Islamabad and Rawalpindi respondents, only 33.6% said they trust food-vlogging influencers, though 94.7% use Instagram ([The News, Mar 2026](https://www.thenews.pk/magazine/money-matters/1405796-reels-and-buffets); the writer's own survey, sample size not stated). Gen Z interviewees were "unanimous" that endorsements are paid ([Aurora](https://aurora.dawn.com/news/1144867)). |
| foodpanda | "What can be delivered now?" | 35 cities, 13,000+ restaurants, about 25% average commission ([Dawn](https://www.dawn.com/news/1941812), [ProPakistani](https://propakistani.pk/2025/08/07/independent-study-by-lums-reveals-foodpandas-usd-1-2bn-economic-impact-on-pakistan-in-fy-2023-24/)). | Restaurant-level stars only. Delivery only. No dish scores ([foodpanda.pk](https://www.foodpanda.pk/city/islamabad)). |
| Blog lists found through Google | "Best biryani in Islamabad" searches. | See section 4.2. | Old, undated, opinion only. Some list closed restaurants. |

**What this means (my judgement, medium confidence).** Your question is already asked every day, and people already answer it for free. So demand is real. But the competitor is not a product. It is habit: ask the group, check Google stars, go. You win only if your answer is clearly better than a two-minute Facebook thread: more trusted, already there, and specific to the dish.

One threat to test this week. Google's "Ask Maps" (Gemini inside Google Maps) widened to more than 150 countries in English in August 2026; Pakistan is not named in what I found ([9to5Google](https://9to5google.com/2026/08/06/google-ask-maps-global/)). Open Google Maps on your phone and ask it "which place has the best chicken karahi in Islamabad?". If it gives a confident answer from review text, that is your real long-term rival. Your edge over it is explicit, comparable dish scores from people who say they ate the dish, not guesses from text.

### 2.2 Competitors and alternatives in Pakistan today

| Name | What it is | Status | Does it answer "best [dish] in [city]"? |
|---|---|---|---|
| Google Maps | Map and reviews | Dominant | Partly. "Popular dishes" inside one restaurant. No city ranking per dish. |
| foodpanda | Delivery marketplace | Dominant, no scaled rival | No. Cuisine pages and restaurant stars. |
| Facebook food groups | Ask-and-answer communities | Large, ageing | Yes, informally, and differently each time. |
| Creators | Reels and vlogs | Growing reach, low trust | No. Not searchable by dish. |
| Blog lists (BlogPakistan, ProPakistani FoodNama, Zameen, Graana) | Opinion articles | Mostly stale. FoodNama's newest posts are from March 2022 ([ProPakistani](https://propakistani.pk/foodnama/)). | Yes, by opinion, once, years ago. |
| Wanderlog | Pages generated from Google data | Active | Restaurant-level only. |
| Tripadvisor | Travel reviews | Thin: 446 restaurants and 6,484 reviews for Islamabad | Has dish pages for paninis, wings and hot pot. None seen for biryani, karahi or nihari ([Tripadvisor](https://www.tripadvisor.com/Restaurants-g293960-Islamabad_Islamabad_Capital_Territory.html)). |
| Discount apps (Peekaboo Guru, Golootlo) | Deals | Mixed. Savyour closed in Feb 2025 ([Profit](https://profit.pakistantoday.com.pk/2025/02/28/pakistans-cashback-startup-savyour-to-completely-shutter-operations)). | No. |
| Restaurant software (Blink, indolj, Tossdown) | Tools sold to restaurants | Active | No. |

**No live Pakistani product ranks restaurants per dish from diners' own dish ratings** (not found after searching; medium confidence).

**But it has been tried here before.**

| Past attempt | What it did | What happened |
|---|---|---|
| foona, Islamabad, about a decade ago | Let users rate individual menu items "so the best burger in town could be found". 4,000+ items from 750+ eateries in beta. | Looks dormant. No post-mortem found ([ProPakistani](https://propakistani.pk/?p=59014)). |
| Food Connection Pakistan, 2011–12 | Restaurant guide with reviews, photos and points for reviewing. Reached about Rs 10 million a year and 150,000 monthly visitors. | Restaurants stopped renewing because the guide could not show what business it brought. The founders pivoted to ordering (EatOye), which foodpanda bought in 2015 ([Profit](https://profit.pakistantoday.com.pk/2017/10/09/a-bridge-between-restaurants-and-patrons)). |
| Top5, Karachi, 2017 | "Yelp of Pakistan", search by dish. | No trace after launch ([Express Tribune](https://tribune.com.pk/story/1391554/entertainment)). |
| Tossdown, 2008 | Started as a restaurant portal. | Now sells software to restaurants ([Tossdown](https://tossdown.com/)). |

The pattern is clear. In Pakistan, a directory with reviews has not survived as a destination. Each one moved to transactions or to selling tools to restaurants.

**Name check.** Four web searches, including Urdu script, found no brand, channel, show or app called "Kahan Khayen". Social handles and the trademark registry could not be checked from here. Do those two checks yourself. This is "no conflict seen", not a clearance.

### 2.3 Comparable products worldwide

| Product | What it was | Outcome | Lesson for you |
|---|---|---|---|
| Foodspotting, 2009 | Dish photos and "best dishes nearby". Raised $3.75m. | Sold to OpenTable for $10m in 2013. Shut in May 2018 ([history](https://www.chefstemp.com/what-happened-to-foodspotting/)). | Interest was never the problem. Money was. |
| Forkly, 2010 | Dish ratings. 300,000 users, 500,000 dish ratings. | Closed in 2013. Users saw no difference from Foodspotting; bigger apps absorbed the feature; the data was never monetised ([TechCrunch](https://techcrunch.com/2013/10/07/forkly-the-foodspotting-competitor-from-brightkite-founders-is-shutting-down)). | Half a million ratings did not save it. |
| Oink, 2011 | Rate items inside places. 150,000 users in weeks. | Closed after five months ([TechCrunch](https://techcrunch.com/2012/03/14/kevin-roses-oink-shuts-down)). | Fast downloads are not a business. |
| New wave, 2024–26 (OnlyPlates, DatDish, Dishy AI, DishRank in France and others) | "Rate plates, not restaurants." | Eight apps found. Each has 11 or fewer store ratings ([example](https://apps.apple.com/us/app/onlyplates/id6478790810)). | The idea is obvious and the app is easy. Density in one city is the whole game. |
| Yelp and Google "popular dishes", 2018–19 | Dish info mined from reviews and photos. | Live. | Incumbents answer "what should I order here?". None ranks a city for one dish. That is your gap. |
| Beli, 2021 | Personal restaurant ranking by comparing pairs. Lists, streaks, invites. No cash rewards. | 120 million+ ratings by Aug 2026. Still no clear revenue model after raising $12m ([Boston Globe](https://www.bostonglobe.com/2026/08/04/lifestyle/beli-restaurant-rating-app/), [Ivey Business Review](https://www.iveybusinessreview.ca/magazine/articles/beli)). | People rate for free at huge scale when rating builds *their own* list. It began as a personal tracker. |
| Untappd, Vivino, Letterboxd | Rate one beer, one wine, one film. | All large. Letterboxd members logged about 900 million films in 2025 ([Wikipedia](https://en.wikipedia.org/wiki/Letterboxd)). | Item-level rating works when the first user gets value alone: a diary, a list, a memory. |
| TasteAtlas, 2018 | Dish-first world rankings. | About 1.9 million visits a month ([Semrush estimate](https://nl.semrush.com/website/tasteatlas.com/overview)). A Karachi nihari restaurant at #89 on its list started an argument across Pakistani social media ([Aaj](https://english.aaj.tv/news/30346960)). | A ranking is distribution. Lists start arguments, and arguments spread. |
| Zomato, 2008 | Began by scanning menus. | Useful with zero users. Ad revenue came around year four ([Outlook Business](https://www.outlookbusiness.com/enterprise/big-idea/serving-it-hot-37)). | Have something useful on the page before the crowd arrives. |
| Burrp, India, 2006 | Yelp-style site that charged restaurants early. | Lost to free Zomato. Sold for almost nothing in 2017 ([YourStory](https://yourstory.com/2017/07/burrp-bookmyshow-acquisition-what-next)). | Do not charge restaurants before you matter to them. |
| Yelp, 2004 | City-by-city reviews. | Community managers seeded at least 15–20 reviewed places before each city went live, then built a named core of reviewers ([CMX](https://cmxhub.com/yelp-elite-nish-nadaraja-psychology)). | Nobody who succeeded waited for strangers to fill an empty site. |

Three lessons, in my words:

1. **Dish-level products die of money and of being easy to copy. They do not die of lack of interest.**
2. **People rate for free when rating serves them first.** A site whose only output is a public ranking gives the first rater nothing back.
3. **Cold start is always manual.** One city, a hand-picked core, public thanks, then the crowd.

### 2.4 What is really different, and will people rate without a reward?

**What is different.**

| Claim | True? | Honest comment |
|---|---|---|
| Ranks a whole city per dish | Yes. Nobody local does it today. | Narrow gap. Google could close it from review text. |
| Only first-party ratings, never for sale | Yes, and rare here. | It only matters once there is data. Low trust in vloggers makes it a real wedge. |
| Speaks the local food language ("karahi", "kadai", "karhai") | Yes | Small advantage. |
| The technology | No | Eight teams shipped the same idea in two years. |

So the product is not the moat. The moat, if you build one, is a living community and a dataset in one city that nobody else has.

**Will people rate without a reward? Yes, a small share will, if it is easy and gives them something back.**

- *Evidence for yes.* The twin cities already produce free reviews at volume: about 71,400 on one Savour Foods branch. One Islamabad home kitchen on foodpanda shows 3,725 post-order ratings ([foodpanda.pk](https://www.foodpanda.pk/city/islamabad)). Beli passed 120 million ratings with no cash.
- *The limits.* In online communities about 90% never contribute, 9% contribute a little and 1% do most of the work ([Nielsen Norman Group](https://www.nngroup.com/articles/participation-inequality/)). About one in ten US adults say they nearly always review restaurants ([Pew, 2016](https://www.pewresearch.org/internet/2016/12/19/online-reviews/)). The highest rates come when a platform asks right after a verified experience: 68% of Airbnb stays get a guest review ([Fradkin et al.](https://andreyfradkin.com/assets/reviews_paper.pdf)). You have no transaction. Your rater must visit, sign in and choose a dish. That is more effort than any of the free-review habits above.
- *Cash is a mistake.* In experiments, money raised the number of reviews but made them shorter ([Burtch et al.](https://pubsonline.informs.org/doi/10.1287/mnsc.2016.2715)) and more positive ([Woolley and Sharif](https://journals.sagepub.com/doi/10.1177/00222437211010439)). Your own terms forbid it. Keep that rule.
- *Status works.* About 44% of Yelp's reviews came from its "Elite" members ([Search Engine Land](https://searchengineland.com/yelp-crushed-citysearch-yahoo-why-google-stealing-yelps-playbook-78623)). Badges produce bursts of the counted action ([Stanford study](https://cs.stanford.edu/people/jure/pubs/badges-www13.pdf)).

Planning numbers (my estimates, low confidence): 1–3% of cold visitors will rate. 25–45% of people you ask one-to-one will rate.

### 2.5 Scenarios for 3, 6 and 12 months

**How I built them.** I counted raters channel by channel for the first three months, then assumed a weekly flow of new raters afterwards. The arithmetic is in the table. Every conversion rate is my estimate. None is measured, because you have no outside traffic yet. Replace them with your own numbers as soon as you have them.

Base case, first three months (11 Nov to 10 Feb):

| Channel | Visits | Become raters | Raters |
|---|---|---|---|
| People you ask one-to-one (80 people) | 80 | 35% | 28 |
| Friends of friends (25 sharers × 150 status viewers × 3% tap) | 112 | 25% | 28 |
| Reddit, developer communities, LinkedIn (3 posts) | 1,500 | 4% | 60 |
| Your own Instagram, WhatsApp Channel, restaurant reshares | 800 | 2% | 16 |
| Facebook groups (taking part, one allowed post) | 600 | 1.5% | 9 |
| QR pilot (2 places × 8 weeks × 5 scans a week) | 80 | 30% | 24 |
| One campus test | 300 | 5% | 15 |
| Search | 100 | 1% | 1 |
| **Total** | **about 3,570** | | **about 180** |

At 4.5 ratings per rater, that is about 815 ratings.

**The three scenarios.**

| Scenario and chance | Measure | 3 months (10 Feb) | 6 months (10 May) | 12 months (10 Nov 2027) |
|---|---|---|---|---|
| **Pessimistic, about 50%.** Friends rate once. Public posts fizzle. Effort fades after January. | Visitors a month | 150–300 | 100–300 | under 200 |
| | Raters (total) | 40–60 | 60–90 | 90–130 |
| | Ratings (total) | 150–250 | 250–400 | 400–600 |
| | Live boards (lists with 5+ ranked places) | 1–2 | 1–3 | 0–3 |
| | Revenue | 0 | 0 | 0 |
| **Base, about 38%.** Slow, steady build. 20 new raters a week after February, 35 a week in the second half. | Visitors a month | 800–1,500 | 2,000–4,000 | 6,000–10,000 |
| | Raters (total) | 150–220 | 350–550 | 1,100–1,600 |
| | Ratings (total) | 650–1,000 | 1,800–2,800 | 6,500–9,500 |
| | Live boards | 4–6 | 10–14 | 25–35 |
| | Revenue | 0 | 0 | PKR 0–100,000 for the whole year |
| **Optimistic, about 12%.** One post takes off, and a creator, group or campus adopts the vote. | Visitors a month | 6,000–12,000 | 20,000–35,000 | 80,000–120,000 |
| | Raters (total) | 800–1,200 | 3,000–4,200 | 12,000–16,000 |
| | Ratings (total) | 4,500–6,500 | 18,000–25,000 | 75,000–100,000 |
| | Live boards | 12–18 | 30+ | 60+ (more dishes and areas) |
| | Revenue | 0 | PKR 50,000–150,000 in total (a first sponsor) | PKR 100,000–300,000 a month |

The chances are my judgement, not a measurement. Real outcomes are a continuum, so read each chance as "ends up closest to this row". They assume today's plan. The changes in this report could move about ten points from pessimistic to base.

**Three facts behind these numbers.**

1. *One live board needs about 65 well-aimed ratings.* If ratings spread unevenly across 15 contenders (the top place gets twice the second, three times the third), the fifth place reaches four raters after about 66 ratings on that dish. Ten ranked places need about 133.
2. *Your January target is almost three times my base case.* 300 raters by early January means 36 new raters every week from a standing start. The base case gives about 110 raters and 500 ratings by then.
3. *Your rankings decay.* Ratings lose half their weight in 180 days. If the "weight" needed to rank uses decayed weights (please check), a place that just qualifies with four raters falls off the board after about 122 days without a new rating. In the pessimistic case the board empties itself by spring. For the first year, consider a 365-day half-life (that gives about 247 days), or use decay for the score only and not for the right to be ranked.

**What would change the odds most, in order.**

1. **One audience partner** (a creator, a group admin or a campus society) who runs the vote as their own.
2. **Concentration.** One dish until it is dense, not 38 lists at once.
3. **Fixing the first impression** before any stranger arrives (lists, empty-state wording, share preview).
4. **A reason to come back and to share** (a personal top-3 card, earned status, a weekly "who moved" post).
5. **More hours on people.** Either your own time moves from code to outreach, or a food-loving friend becomes the community lead.

## 3. Traffic: where it will really come from

**Short answer.** In year one your traffic comes from people, not from Google: WhatsApp, Reddit, one campus, one partner with an audience. Search is a slow second engine that starts paying after month six. Paid ads are not worth it yet.

All volumes below are my estimates for the first six months. Confidence is low to medium, because you have no real traffic to measure yet.

| Source | Realistic volume (first 6 months) | Time to first results | Your effort | Cost | Notes |
|---|---|---|---|---|---|
| **WhatsApp** (one-to-one asks, status, groups) | 300–1,000 visits. The best conversion of any source: 25–45% of people you ask directly. | Days | 1–2 hours a week | Free | Links from WhatsApp open in the phone's normal browser, where Google sign-in works ([tested on iPhone in 2022](https://krausefx.com/blog/announcing-inappbrowsercom-see-what-javascript-commands-get-executed-in-an-in-app-browser); confirm on your Android phone). This is your lowest-friction channel. A WhatsApp Channel is for keeping raters, not for finding them: small Pakistani channels I saw had 26 to 310 followers. |
| **Reddit, developer communities, LinkedIn** | 1,000–5,000 visits, in spikes. 3–6% become raters. | Days | 2–3 hours per post, including replies | Free | r/islamabad has about 229,000 members, grows about 20% a year, covers Rawalpindi, and food questions are a visible share of its posts ([GummySearch](https://gummysearch.com/r/islamabad/)). r/developersPak has about 48,000. Repeatable each month if you bring new results. |
| **Facebook food groups** | 500–3,000 visits, only if an admin allows it or partners with you. 1–2% become raters. | Weeks | High. It is a relationship, not a post. | Free to unknown | The documented norm in big groups is free but rationed promotion. Visitors arrive inside Facebook's browser, where Google sign-in fails without an extra step. I could not find names, sizes or rules of twin-city groups; you must look inside Facebook yourself. |
| **Your own Instagram and TikTok, plus reshares by ranked restaurants** | 200–2,000 visits. About 2% become raters. | 4–8 weeks | 1–2 hours a week | Free | Tag the top three in every ranking post. Restaurants reshare praise. Same in-app sign-in problem. A bonus: public posts from Instagram professional accounts can now appear in Google ([PPC Land](https://ppc.land/instagram-content-becomes-searchable-on-google-starting-july-10/)). |
| **Creators** | 300–3,000 visits per collaboration | Weeks | 2–4 hours of outreach each | Small accounts: free meals are the norm, or PKR 2,500–25,000 per Reel. Mid accounts: PKR 10,000–180,000. Big Islamabad accounts (420,000–570,000 followers): PKR 150,000–750,000 by published bands ([Voosha](https://voosha.io/blog/influencer-rates-in-pakistan), [Collabscafe](https://collabscafe.com/blog/pakistan-influencer-rates-2026)). | You have no meal to offer. Offer content instead: your data for their "best of" video. |
| **Google search** | About zero for three months. 100–500 visits a month by month six. 1,000–5,000 a month by month twelve, if you have 20+ live pages and a few links. | 3–6 months | Low. Publish only pages with real data. | Free | The whole pool is small. See section 4. |
| **AI answers** (Google AI Mode, ChatGPT and others) | Mentions, few clicks | Unknown | Low | Free | Worth being quotable. Not a traffic plan. See section 4.7. |
| **QR cards in restaurants** | 3–20 ratings a week per busy place if staff mention the card. One or two a week if they do not. | 2–4 weeks | Half a day per place to set up | About PKR 500–1,500 per card (my guess; no source) | Vendor benchmarks for one-tap Google reviews give 1.5–3 reviews per 100 diners ([Visu](https://visu.network/blog/track-review-qr-code-performance/)). Yours needs a sign-in, so plan on a third of that. It biases rankings towards places with cards. See section 6. |
| **Campus** | 100–500 raters in a term, if one society or class network adopts it | From 18 January | Medium | Free | Finals run 14 December to 8 January at FAST and 26 December to 1 January at Bahria; spring classes start 18 and 25 January ([FAST](https://www.nu.edu.pk/Student/Calender), [Bahria](https://www.bahria.edu.pk/page/PageTemplate4?pageContentId=3172&websiteId=1)). The clean window is 18 January to 7 February. |
| **Press** | 200–2,000 visits per story, once | Needs results first | 2–3 hours per pitch | Free if earned. Sponsored posts are sold on enquiry with no public prices. | A data story works; a launch notice does not. Islamabad Scene accepts contributed food articles ([contribute page](https://www.islamabadscene.com/contribute/)). |
| **Food festivals** | 20–60 ratings in a day, as a visitor with a QR code (low confidence) | December | One day | Ticket Rs 700–2,500. A stall cost Rs 50,000–60,000 in 2022 ([APP](https://www.app.com.pk/?p=562274)). | Pindi Food Fest ran in mid-December 2025 with 100+ stalls ([Express Tribune](https://tribune.com.pk/story/2582171/pindi-food-fest-draws-hordes-of-foodies)). No 2026–27 dates are announced. Go as a visitor. Do not buy a stall. |
| **Paid ads** | PKR 15,000 buys about 29,000–86,000 impressions and 125–1,300 clicks on Meta | Days | Low | PKR 5,000–15,000 | Clicks land in the in-app browser. At a 2% rating rate that is PKR 600–6,000 per rater. Not worth it now. See section 6.7. |

**How the sources fit together.**

- *Months 0–3:* WhatsApp and Reddit bring the first 100–200 raters. One partner or one campus can double that.
- *Months 3–6:* Instagram posts, restaurant reshares and QR cards add a steady trickle. Ramadan content brings the first search visits.
- *Months 6–12:* search grows as more lists go live and a few sites link to you. Social stays the larger share all year.

## 4. SEO deep dive

**Read this first.** Two limits apply to this whole section. First, no source I could reach shows a search volume for any "best [dish] in Islamabad" query, so the volumes below are estimates. Second, the result pages were checked on a US-based search engine, not on Google Pakistan. It shows no Maps pack and no AI Overview. Treat the picture as a good approximation, and confirm it on your own phone.

### 4.1 Keyword demand

**The only hard numbers found** (Semrush's Pakistan database, September 2026; a tool's estimate, not Google's data):

| Query | Searches a month | What it tells you |
|---|---|---|
| "restaurants" | 450,000 | Huge, but answered by the Maps pack. Not winnable. |
| "cheezious menu" | 135,000 | Menu and brand searches dwarf "best dish" searches. The brand's own site ranks first. |
| "cheezious saddar", "cheezious commercial market" | 8,100 each | People search by area. Useful later for area pages. |

Sources: [Semrush, foodpanda.pk](https://www.semrush.com/website/foodpanda.pk/overview/), [Semrush, cheezious.com](https://pl.semrush.com/website/cheezious.com/overview).

**My estimates for your queries** (low confidence; could be wrong by a factor of five either way):

| Query type | Examples | Searches a month, each | Can you win it? |
|---|---|---|---|
| Top dish × city | "best biryani in islamabad", "best karahi in islamabad", best burger, best pizza | 100–1,000 | Maybe, in 6–12 months. Strong old domains rank today. |
| Mid dish × city | "best nihari in rawalpindi", halwa puri, haleem, pulao | 10–100 | Yes, in 1–4 months, once the page holds real data. |
| Rawalpindi dish queries | "best biryani in rawalpindi" | Lower than Islamabad | Yes. Less contested: results fall back to Islamabad pages. |
| "Near me" | "karahi near me", "biryani near me" | Larger | No. The Maps pack owns these. |
| Area | "restaurants in f7 islamabad", "f7 food" | Unknown | Later, with area pages that hold data. Property blogs rank today. |
| Roman Urdu | "islamabad ki best biryani", "sab se achi biryani islamabad" | Under 50 | Yes, almost by default. English pages answer them today; nobody targets them. |
| Ramadan | "iftar buffet islamabad", "sehri in islamabad" | Large for five weeks a year | Partly. "Sehri in islamabad" is mostly prayer-time pages. Buffet lists are refreshed yearly by big publishers. A dish-level sehri list would be different from all of them. |

How I got the top line: 450,000 "restaurants" searches nationally; I assume the twin cities make 3–8% of Pakistan's searches, and that all "best [dish] in Islamabad or Rawalpindi" queries together equal 5–20% of that. That gives **about 700 to 7,000 searches a month in total**, spread over a few dozen dish-city pairs. Only the first input is measured.

**The honest reading:** even if you ranked first for everything, search alone would bring a few thousand visits a month. It is a real channel, but a small one in two cities.

**Get real numbers in 15 minutes.**

1. Google Ads Keyword Planner (a free account, no spend): set location to Islamabad Capital Territory and Rawalpindi, paste your 19 dish queries for both cities.
2. Google Trends: compare biryani, karahi, nihari, burger and pizza for Islamabad. Look at the Ramadan spike for "iftar" and "sehri".
3. From January: your own Search Console impressions. That is the only exact data you will ever get.

### 4.2 What ranks today

| Query | What came up, in order | Age and quality |
|---|---|---|
| best biryani in islamabad | A ProPakistani first-person article, a BlogPakistan list, personal blog posts, Wanderlog pages, an Express Tribune feature, Trip101, foodpanda restaurant pages | 2020–2022 mostly. The BlogPakistan list has no date and still shows three of its ten places as closed. The Tribune piece (Jan 2026) rests on a stall owner and two customers. |
| best karahi in islamabad | A ProPakistani FoodNama list, BlogPakistan, Wanderlog, Dawn features | Five places, about 900 words, no date. FoodNama's newest posts are from March 2022. |
| best nihari in rawalpindi | Dawn features from about 2016, Express Tribune, a combined BlogPakistan list | Old. |
| best burger / pizza in islamabad | Dawn (2017), Zameen (2019), a restaurant-software company's blog (2022), Lovin Isloo (2021, about 330 words) | Old and thin. |
| restaurants in f7 islamabad | Graana, Zameen, MenuPoint | Property blogs. |
| iftar buffet islamabad | Express Tribune, Dawn Images, ProPakistani, Daily Pakistan (Feb 2026) | Refreshed every Ramadan. |

Across 15 queries the same domains repeat: Dawn, ProPakistani, BlogPakistan and Wanderlog (about ten queries each), Express Tribune (nine), Graana (seven), Zameen and foodpanda restaurant pages (five each).

Three findings:

1. **Nothing that ranks is dish-level and data-based.** Every list inspected is one writer's opinion at restaurant level, with no method.
2. **The content gap is real, and so is the authority gap.** The pages are weak. The domains are strong.
3. **Tripadvisor and foodpanda are not in your way.** Tripadvisor's Islamabad dish pages cover paninis and wings, not biryani or karahi. foodpanda has cuisine pages, not dish pages.

What I could not see: Google Pakistan's Maps pack (in US studies it appears on 91–97% of local result pages, [Synup study](https://www.techcompanynews.com/when-does-google-show-ai-overviews-for-local-searches-findings-from-synups-53900-page-study/)), and any YouTube, Instagram or Facebook results. Search your top five queries on your own phone and note what sits above the first normal result.

### 4.3 Your real chances, the pages you need, and the timeline

**Base rates are harsh.** Ahrefs measured that 1.74% of new pages reach Google's top 10 within a year, and that the average page in first position is about five years old. But of the pages that did make it, 41% got there in their first month ([Ahrefs, May 2025](https://ahrefs.com/blog/how-long-does-it-take-to-rank-in-google-and-how-old-are-top-ranking-pages/)). In plain words: most pages never rank, and pages that deserve to rank do so quickly.

Your case is better than the base rate for small dish queries, because the competition is stale and your data is unique. It is worse for the big queries, because Dawn, Tribune and ProPakistani are strong domains.

| When | What to expect | Confidence |
|---|---|---|
| Weeks 0–3 | Home and static pages indexed. You rank for your own name. | High |
| Months 1–4 | First top-10 positions for small and Rawalpindi dish queries, if the pages hold real data and a few sites link to you. | Low-medium |
| Months 6–12 | A chance at the big queries ("best biryani in islamabad"). Not likely before month nine. | Low |
| Month 12, base case | 1,000–5,000 search visits a month. | Low |

**The pages you need, in order.**

1. **Dish × city pages with at least three ranked places.** This is the core. Put the answer in the first lines, in a sentence a person or a machine can quote: *"As of 12 January 2027, 41 diners rate X highest for chicken karahi in Islamabad (8.7 out of 10). Y and Z follow."*
2. **Season collections built from the same data.** "Sehri in Islamabad: the best-rated halwa puri, nihari and chai." One per city. Live by 25 January.
3. **Results pages.** "Islamabad karahi, winter 2026–27: the results." A fixed page that journalists and restaurants can link to.
4. **Dish × area pages, only when an area has five or more ranked rows.** Start with areas people search (F-7, F-10, Bahria Town, Saddar, Commercial Market) and campus sectors (H-11, H-12, E-8, E-9).
5. **Restaurant pages framed as "what to order at X".** Its ranked dishes first. That is something Google Maps does not give.

**What not to build.** No AI-written guides and no pages without data. Google's spam policy names "substantially similar pages that are closer to search results than a clearly defined, browseable hierarchy" as doorway abuse ([Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)). A dish × city × area grid with empty cells looks exactly like that. Your defence is simple: every indexed page holds numbers nobody else has.

**Small things that help.**

- **Titles with proof.** "Best Chicken Karahi in Islamabad: ranked by 41 diners (Jan 2027)".
- **One Roman-Urdu line per page**, as a natural sub-heading: "Islamabad mein sab se achi chicken karahi kahan milti hai?"
- **Refresh on the flip.** With ISR, the noindex tag lives in the cached page. When a page becomes indexable, revalidate that page and the sitemap at that moment. Then check the live page, not your assumption.
- **Stars in Google.** Do not chase them now. List pages cannot show review stars. A restaurant page could, but only for a clearly shown restaurant-level number; a dish score must never be marked up as the restaurant's rating ([Google review snippet rules](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)). Google's list carousels are limited to Europe, Türkiye and South Africa.

### 4.4 Technical check of the live site

**How I checked.** I fetched each public page as text on 11 November 2026. The tool does not run JavaScript. It could not open `/rate` or `/sign-in`, because your robots.txt blocks them (that is correct behaviour). I could not see raw HTML, response headers or JSON-LD. Items marked "check" need five minutes from you with view-source or Search Console.

**What is already good. Keep it.**

- Titles match real queries: "Best Chicken Biryani in Islamabad (2026) · Kahan Khayen".
- URLs are clean: `/islamabad/best-chicken-biryani`, `/islamabad/r/butt-karahi-tikka-f-8`.
- Unranked dish pages send `noindex, follow`. Privacy and Terms are noindex while they are drafts.
- robots.txt blocks `/admin`, `/owner`, `/me`, `/rate`, `/sign-in`, `/join`, `/api` and names the sitemap. Nothing blocks AI crawlers.
- The sitemap holds only pages worth indexing: home, two city pages, one restaurant page, four static pages.
- Each dish page has its own share image.
- "Open in Google Maps" is a plain link by coordinates. That needs no Google API and breaks no terms.

**Findings.**

| # | Finding | Why it matters | Fix | Severity | Confidence |
|---|---|---|---|---|---|
| 1 | On dish and restaurant pages, the fetched HTML had **no H1 in the body**, and the footer text came **before** the main content. Home, city and static pages were fine. | This pattern usually means the main content is streamed in after the page shell. Google runs JavaScript and will probably still see it. Many AI crawlers and some preview bots do not run scripts. | Run `curl` on a dish page and look for `<h1>`. In Search Console use URL Inspection → View crawled page. If the H1 is not in the first HTML, move the page header outside the loading/Suspense boundary. | Medium, if confirmed | Medium-low (my tool may have dropped it) |
| 2 | The link preview of an unranked dish page says the page is empty: *"10 places to try. None has a vote yet. Rate Chicken Biryani to help rank the restaurants."* | This is the text WhatsApp shows under every shared link. Your growth plan runs on WhatsApp. The preview tells people nothing is there. | Give unranked pages their own preview text, for example: *"Vote: who makes the best chicken karahi in Islamabad? 4 votes put a place on the board."* | **High** (for sharing, not for Google) | High |
| 3 | Restaurant pages become indexable after **one** rating. The one indexable restaurant page shows three dishes with "Not enough votes yet · 1 vote", an address and a phone number from open data. It shows no score. | It is a thin directory page. A searcher learns nothing that Google Maps does not already show. Hundreds of such pages would lower how Google sees the whole site. | Index a restaurant page only when it has at least one **ranked** dish. | Medium | Medium |
| 4 | The About page does not say who runs the site, how to reach them, or how the site makes money. Your name and email appear only on the noindex draft Privacy and Terms pages. | You sell trust. Diners, owners, journalists and Google's quality raters all look for "who is behind this". An anonymous ranking site looks like someone's paid project. | Add your name, one line on why you built it, a contact address on your own domain, and one line on money: "We earn nothing today. Rankings are never for sale." | Medium | High |
| 5 | Unchecked listings show a phone number taken from open data. | Numbers can be wrong, or personal. That brings complaints. | Hide phone numbers until a listing is checked or claimed. | Low-medium | Medium |
| 6 | Home (`/`) and `/islamabad` show the same 19 cards and the same trust block. | Low risk, but it wastes the home page. | Make home city-neutral. Lead with what is live in both cities. | Low | High |
| 7 | Home cards for dishes with **no listed places** say "Not enough votes yet". | The label is wrong. The problem is no places, not few votes. | Say "No places listed yet. Add one." Better: hide these dishes for now (see section 5). | Low | High |
| 8 | The canonical tag looked empty on noindex dish pages and absent on `/about/data`. | Small hygiene issue. | Check view-source. Emit a self-canonical or none. | Low | Low |
| 9 | Restaurant pages have no share image (`twitter:card` is "summary"). | A WhatsApp share of a restaurant page has no picture. | Reuse the dish share-image code for restaurants. | Low | High |
| 10 | Dish lists show 10 rows, then "Show more (46 left)". | Rows behind the button are not in the HTML. Fine today. A problem once those rows are ranked. | Put every **ranked** row in the first HTML. Paginate only unranked rows. | Low now | High |
| 11 | Titles carry "(2026)". | It must roll to 2027 by itself on 1 January. | Check that the year is computed, not typed. | Low | — |
| 12 | I could not verify JSON-LD. | — | Test one dish page and one restaurant page in Google's Rich Results Test. Add `BreadcrumbList`. Never mark a dish score as the restaurant's own `AggregateRating`. | Low | — |

**Your ten-minute checklist.**

1. `curl -s https://kahankhayen.com/islamabad/best-chicken-karahi | grep -o "<h1[^>]*>.*</h1>"`
2. Search Console → URL Inspection → the Butt Karahi page → View crawled page → check the H1 and the JSON-LD.
3. Rich Results Test on one dish page and one restaurant page.
4. Share a dish link to yourself on WhatsApp. Read the preview as a stranger would.
5. Open a made-up URL such as `/islamabad/best-xyz`. It must return a real 404 status, not a 200 page.

### 4.5 Noindex rules and internal linking

**Noindex rules.** Your rule (dish pages stay noindex until a place ranks) is right. Three changes:

| Page type | Rule today | Rule I suggest | Why |
|---|---|---|---|
| Dish × city | Index when 1 place ranks | Index when **3** places rank | A podium is an answer. One ranked place is not "the best in Islamabad". |
| Restaurant | Index after 1 counted rating | Index when it has **1 ranked dish** | Removes thin pages (finding 3). |
| Dish × area (future) | — | Noindex until 5 ranked rows in that area | Avoids empty doorway-style pages. |

One practical point. Google visits pages that stay noindex for a long time less and less often. So when a page goes live, do two things by hand: make sure it is in the sitemap with a fresh `lastmod`, and press "Request indexing" in Search Console. It takes a minute per page.

**Internal linking.** The basics work: home → dish → restaurant → dish. Add three cheap links when pages go live:

- On each dish page: the same dish in the other city ("Chicken karahi in Rawalpindi").
- On each dish page: three or four live sibling dishes in the same city.
- On each restaurant page: its area, once area pages exist.

Do not link from indexable pages to large numbers of empty pages. Today the home page links to 19 noindex pages. That is harmless for Google, but it is the main design problem (section 5).

### 4.6 Backlinks you could realistically earn

A realistic goal is **5 to 15 linking sites in six months** (my estimate, low confidence). Each needs a reason to link. A launch is not a reason. A result is.

| Source | How to earn it | Chance | Worth |
|---|---|---|---|
| Islamabad Scene | It accepts contributed food articles by email ([contribute page](https://www.islamabadscene.com/contribute/)). Send "What 200 diners say is Islamabad's best karahi", with the method. | High | Local readers, a real link. |
| Lovin Isloo, Youlin Magazine | Pitch the results as a city story. | Medium | Local readers. |
| APP's Islamabad desk, Express Tribune city pages, Dawn Images | A data story. Today's food features run on anecdote: Tribune's January 2026 biryani feature quoted a stall owner and two customers. Numbers give a reporter something new. APP features get reprinted by Dawn. | Low-medium | Strong domains. |
| ProPakistani, TechJuice | The founder angle: built in three weeks, open map data, no paid rankings. TechJuice's own advice is to pitch reader value and offer one journalist an exclusive ([TechJuice](https://techjuice.pk/7-beneficial-tips-for-startups-to-get-free-press-coverage/amp)). Both also sell sponsored posts on enquiry; treat those as adverts, not as links. | Low-medium | Tech readers, brand searches. |
| Ranked restaurants | A small badge they can post or embed: "#1 chicken karahi in Islamabad, winter 2026–27". It links to the ranking. | Medium, once rankings are credible | Many small links and mentions. |
| Reddit threads | Answer "best karahi?" threads with your data when you have it. Links carry no ranking weight, but threads rank in Google and are heavily cited by AI answers. | High | Visibility more than links. |
| Developer communities | A technical write-up: per-dish ranking maths, building on Overture data. Show HN accepts only things people can try ([guidelines](https://news.ycombinator.com/showhn.html)). Overture has no showcase page, so share through its community channels. | Medium | Global, technical. A few good links, no local users. |
| Your own open data | Publish each ranking as a dated CSV with a "credit Kahan Khayen" licence. Journalists and bloggers cite data they can download. | Medium | Slow, but it compounds. |

Do not buy links. Paid links are supposed to be marked as sponsored, and they bring readers, not ranking.

### 4.7 How AI answers affect these queries

**Facts.**

- Google's AI Overviews and AI Mode are both live in Pakistan, and both support Urdu ([AI Overviews help](https://support.google.com/websearch/answer/14901683?hl=en), [AI Mode help](https://support.google.com/websearch/answer/16011537?hl=en)).
- On plain restaurant "best" searches, AI Overviews are rare. A September 2026 US crawl of 53,900 result pages found them on 1.2% of restaurant "best" searches and 0.4% for cafes, while the map pack showed on 91–97% of pages. For "best … for a specific need" searches the figure was 75% ([Synup study](https://www.techcompanynews.com/when-does-google-show-ai-overviews-for-local-searches-findings-from-synups-53900-page-study/)). These are US numbers. Nothing has been measured for Pakistan.
- AI Mode and chat assistants always answer. In a US test of 200 dining questions, the most-cited sources were Reddit (22% of answers), Google Maps (19%), OpenTable and Instagram (13% each), and editorial best-of lists. Restaurants' own sites almost never appeared ([cloro](https://cloro.dev/blog/restaurant-seo/)).
- Where an AI Overview appears, clicks fall. Pew saw visitors click a result in 8% of visits with an AI summary against 15% without ([Pew, July 2025](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)). Ahrefs ties an overview to 58% fewer clicks for the top result ([Ahrefs, Feb 2026](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update)). Google disputes the Pew method.
- Research on what gets cited: adding statistics, quotations and source citations raised a page's visibility in AI answers by 30–40% in a 10,000-query benchmark, and the gain was largest for lower-ranked sources ([GEO paper](https://arxiv.org/html/2311.09735v3)). `llms.txt` shows no measurable effect ([SE Ranking analysis, via SEJ](https://www.searchenginejournal.com/llms-txt-shows-no-clear-effect-on-ai-citations-based-on-300k-domains/)).

**What it means for you (my judgement, medium confidence).**

- For "best biryani in islamabad", the thing above the normal results is the map pack, not an AI box. That was true before AI.
- For longer questions ("best karahi in Islamabad for a family, not too oily"), people will ask an assistant. The assistant builds its answer from Google Maps data, Reddit, Instagram and whatever lists exist. In Islamabad, the lists that exist are old blogs. **A source with fresh, explicit numbers has room.**
- You have no clicks to lose. Being quoted is pure gain: "According to Kahan Khayen, 41 diners rate X highest."
- Assistants reward what *others* say about you. A Reddit thread or an Islamabad Scene article that repeats your ranking counts as much as your own page.

**Checklist. All of it is cheap.**

1. First sentence of every ranked page: the answer, the number of raters, the date.
2. Link the method on every page.
3. Keep search crawlers for AI allowed. Your robots.txt already allows all crawlers.
4. Skip `llms.txt`.
5. Post every result on Reddit and Instagram in the same one-sentence form.
6. Check how assistants answer once a month, over several questions. Answers change from run to run.

**The larger threat is not lost clicks.** It is Google answering dish questions from its own review pile (Ask Maps, section 2.1). Your protection is data Google does not have: explicit dish scores from people who say they ate that dish.

## 5. Design review

I reviewed your ten desktop screenshots and the text of the live pages. I did not see the site on a phone, so phone points below are checks, not findings.

### 5.1 First impression, trust, clarity, appetite, phone

| Area | Score | One-line reason |
|---|---|---|
| Clarity in 3 seconds | 8/10 | The headline asks the exact question the product answers. |
| Craft | 8/10 | Type, spacing and restraint are better than most funded local apps. |
| Trust | 5/10 | Calm and honest, but no people, no numbers, no "who runs this". |
| Feels alive | 1/10 | Every page says zero, several times. |
| Appetite | 2/10 | No food anywhere. Cool green and grey. The same line icon repeats. |
| Phone use | not scored | Desktop screenshots only. See the checks below. |

**What works. Keep it.**

- The headline "Where's the best chicken karahi in Islamabad?" and the Roman-Urdu tagline.
- The honest small print: "Scores are diners' opinions, not facts about a restaurant."
- "Rate the places you know": scoring several places on one screen is the best idea in the interface. It is also your best data, because one person compares several places.
- It looks like a real product. That matters when you ask strangers to sign in.

**What hurts, in order of damage.**

1. **Every page announces that it is empty.** A dish page says, above the fold: "Early rankings · 4 raters needed", "None has a vote yet", "0 of 4 raters so far", and "Not ranked yet · from open map data". Four statements of absence. It is honest. It also reads as a dead site. The fix is wording, not code: when a number is zero, do not show the number. Show the invitation. *"Be one of the first four to rate. You decide Islamabad's first karahi ranking."* You already have a good line on the karahi page ("Your rating can put the first Chicken Karahi on the list"). Lead with that and drop the zeros.
2. **The home page asks 19 times before it gives once.** Every card ends with "Rate one you know →". A visitor came for an answer. Today the site cannot give one, so the home page should not pretend to be a directory of 19 lists. Show one or two dishes that are open for voting, big. Put the rest under "Coming next — tell us which places should be on the list".
3. **The lists look machine-made, because they are.** This is the most serious trust problem on the site. See 5.3.
4. **The main action is dressed as a secondary one.** On a dish page, "Rate the places you know" is an outlined button. The filled green button is "Rate a dish" in the header. Swap the weight: the on-page button should be the loud one.
5. **Jargon in the badge.** "Early rankings · 4 raters needed" means nothing to a first-time visitor. Plain words: "New list. 4 votes put a place on the board."
6. **The sticky header is see-through.** In two of your screenshots, list text ("Karachi Biryani House", "Biryani Hub") shows through the header while scrolling. Give the header a solid background.
7. **The 1–10 row has no anchors.** Nothing says what a 7 means. Add two tiny labels: "1 = bad" and "10 = best I've had". It reduces score inflation and makes people's numbers more comparable.

**Trust: what to add.**

- Who runs it, on the About page (section 4.4, finding 4).
- A live counter once it is not embarrassing: "214 ratings from 61 diners in Islamabad".
- "Updated 3 days ago" on every ranking. Freshness is your edge over 2022 blog lists.
- A plain sentence on money: "No restaurant has paid us. None can."

**Phone checks (I could not see these).**

- Ten buttons across a 360 px screen leaves under 30 px each. A comfortable tap target is 44–48 px. If the row does not wrap into two rows of five on phones, make it wrap.
- "One tap saves your score" needs a visible undo for a few seconds. Thumbs slip while scrolling.
- Fifteen places × ten buttons is 150 tap targets on one screen. Watch three people use it before changing anything. If they hesitate, try a lighter first step: "Which of these have you tried?" as chips, then score only those.
- On a 360 × 640 screen, the first view of a dish page should show the title, one line of invitation and the main button. Today the badge, the zero counter and the filters come first.

### 5.2 The missing images

**Should you add food imagery? Yes. But it is your third design problem, not your first.** Empty pages and wrong lists hurt more (5.1 and 5.3). And the first place to add images is where sharing happens (share cards and dish headers), not everywhere.

Why it matters: food images capture attention and raise the desire to eat, most of all in hungry people ([Spence et al., 2016](https://www.sciencedirect.com/science/article/pii/S0278262615300178)). DoorDash tells its merchants that menus with a header image often earn more sales ([DoorDash](https://help.doordash.com/en-us/merchants/article/doordash-photos-types)). I did not find a published percentage, so treat the size of the effect as unknown.

**One rule keeps you honest.** A photo shown next to a restaurant must be that restaurant's dish. A photo at dish level is category art, and it must really show that dish.

**The options compared.**

| Option | Cost | Makes you hungry? | Honest? | Risk | Verdict |
|---|---|---|---|---|---|
| 1. Photos by you and your founding raters, credited by first name | Free | Yes. Real and local. | Yes | Low. Get a one-line permission. No faces. | **Start here.** Six to eight dish covers. |
| 2. Approved diner photos on ranked rows | Free. Machine screening costs about USD 1.50 per 1,000 images ([Cloud Vision](https://cloud.google.com/vision/pricing)). | Yes | The most honest: it is the dish at that place. | Medium. Someone uploads a photo they did not take; faces in frame. | **Second.** You have almost no uploads, so approve by hand. |
| 3. Owner photos on claimed listings, labelled "From the restaurant" | Free | Yes, but glossy | Fair, if labelled | Low | Third. It also gives owners a reason to claim. |
| 4. Paid stock | About USD 25–30 for 10 images on a one-month plan; USD 50–60 for 20 ([Adobe Stock](https://stock.adobe.com/plans), [Shutterstock](https://www.shutterstock.com/pricing)) | Fair to good | Only if it truly shows that dish | Low. Clear licence. | Use to fill gaps. Check each image. |
| 5. Free stock (Unsplash, Pexels, Pixabay) | Free | Mixed | **Poor for most of your dishes.** Pixabay returns one image each for nihari, haleem and chapli kabab. Unsplash and Pexels show generic curries under those names. | Licences allow commercial use. A small risk remains that an uploader did not own the photo. | Only where the photo really is the dish (biryani, karahi, seekh kabab, chai). Never a "close enough" curry. |
| 6. A commissioned set of about 20 illustrations | About USD 100–900 at Fiverr list prices, PKR 28,000–249,000 (estimate, low confidence; local rates not found) | Less than photos | Yes. Nobody mistakes it for a real plate. | None once paid | A good brand asset later. It would replace today's repeated line icons. |
| 7. AI-made illustrations, labelled | Near zero | Not once labelled | Legal, but off-brand | Google allows AI images if labelled ([Google](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)). In a peer-reviewed test, telling viewers a food image was AI-made cancelled its appeal ([Califano and Spence, 2024](https://www.sciencedirect.com/science/article/pii/S095032932400051X)). Delivery apps were embarrassed by AI food photos in 2024 ([404 Media](https://www.404media.co/ghost-kitchens-are-advertising-ai-generated-food-on-doordash-and-grubhub/)). | **Skip.** Your voice is "real people, nothing generated". Never use photo-real AI food. |

**The order I would follow.**

1. **Weeks 1–3: six to eight cover photos** for the featured dishes, taken by you and your founding raters. Brief them in one line: daylight, from above or at 45 degrees, the dish fills the frame, no faces, no logos. Credit them: "Photo: Ali R., founding rater". Use each cover in three places: the dish page header, the home card and the share image.
2. **When a place becomes number one,** a diner's photo of its dish becomes the cover for that list: "Cover: this season's #1". It is honest, and it is a small prize.
3. **December: turn on approved diner photos** as small thumbnails on ranked rows.
4. **Later:** an illustration set to replace the icons, and owner photos on claimed pages.

**Copyright, privacy and speed.**

- *Copyright.* Keep a simple log for every image: who took it, when, and their permission. Your terms already say photos must be taken by the poster. Add a "this is my photo" tick box and a takedown link.
- *Privacy.* Hold any photo with a face for manual review. Face detection costs the same as the safety check. This matters most for women photographed in restaurants.
- *Speed.* One cover image of 30–60 KB in a modern format, sized for a phone. Lazy-load everything below the first screen. Vercel's free plan includes 5,000 image transformations a month; Supabase's free plan holds about 5,000 photos at 200 KB each (estimate).

### 5.3 Other things that hurt

**A. The "Places to try" lists are thin and skewed. This is your biggest first-impression problem.**

What I saw on the live site on 11 November:

| Page | What the list shows | Problem |
|---|---|---|
| Best chicken karahi in Islamabad | 7 places. All seven are called "Butt Karahi" in some form (Baba Butt Karahi, Butt Karahi G-13, Butt Karahi By Usman Tahir…). | It reads like a joke. This is the dish you plan to launch first. |
| Best chicken biryani in Islamabad | 10 places, A to Z. The first is a small shop in Bahria Town. One is a daal shop with "biryani" in a long name. | Only 2 of the 10 appear in the published "best biryani in Islamabad" lists I found ([BlogPakistan](https://blogpakistan.pk/biryani-in-islamabad), [Express Tribune](https://tribune.com.pk/story/2585337/biryani-still-rules-capitals-food-scene)). Names those lists repeat (Chacha Jee, Biryani Hut, Sarang Sindhi Cuisine, Adan's Cafe, Khoka Khola) are missing. |
| Best pizza in Islamabad | 56 rows. Chains appear once per branch (Broadway ×2, California ×2, Domino's ×2 in the first ten rows). | Votes will split across branches. |
| Rawalpindi | 4 karahi places, 4 biryani places, none for halwa puri. | Rawalpindi's old-city breakfast and nihari places have little online presence, so open map data misses them (my judgement). The best traditional food has the weakest coverage. |

A local decides in two seconds whether a food site "knows the city". Wrong names fail that test before anyone reads your rules.

The fix is honest and breaks none of your rules:

1. **Rename the list "Contenders".** That is a claim you can back. You chose candidates. You do not say they are good.
2. **Show only checked contenders.** Twelve to fifteen per dish. Every other listing stays reachable through "Find a place" and "Add a place". Name-matched places no longer appear by default.
3. **Build each contender list from public reputation.** Use your own knowledge, what friends name, and the places people repeat in food-group and Reddit threads. Reading threads to decide who gets on the ballot is research. It imports no ratings.
4. **Stop sorting A to Z.** The top row gets more ratings just for being on top. Shuffle unranked contenders on each load, or sort by the visitor's chosen area.
5. **End every list with "Missing a place? Add it."** Nominating is the lightest way to take part. People who nominate usually rate.
6. **Drop "from open map data" from the list header.** Keep the credit on the data page and on unchecked restaurant pages, where it belongs.

**B. Chains.** Each branch is its own restaurant today. For pizza, zinger, burger, broast and shawarma, chains dominate, and people say "Cheezious ka pizza", not "Cheezious I-8 ka pizza". Suggested model: rate at the branch, rank at the brand when a brand has three or more branches in the city, and show "best branch" when data allows. Until that exists, do not feature those five dishes.

**C. The duplicate list.** When "Rate the places you know" is open, the same places appear twice on the page. Hide the lower list while the panel is open. Better: treat the panel as the same list in "rating mode".

**D. Unchecked listings.** You have 1,264 listings and almost none are checked. You cannot check them all in 7–8 hours a week. You do not need to. Check the roughly 150 that will be contenders in your first ten lists. Leave the rest searchable but unlisted.

**E. Empty states. Suggested wording.**

| Where | Today | Suggested |
|---|---|---|
| Dish page subtitle | "10 places to try. None has a vote yet." | "12 contenders. Voting is open." |
| Progress line | "0 of 4 raters so far for the first ranked Chicken Biryani in Islamabad" | "Be one of the first four to rate. You decide the first ranking." |
| List header | "Places to try · Not ranked yet · from open map data" | "Contenders · checked by us. Missing one? Add it." |
| Badge | "Early rankings · 4 raters needed" | "New list · 4 votes rank a place" |
| Home card with no places | "Not enough votes yet" | Hide the dish, or "Nominate places" |
| Share preview | "10 places to try. None has a vote yet…" | "Vote: who makes Islamabad's best chicken karahi?" |

**F. Your scores will look low at first.** Your method page says the city average counts as 8 extra ratings and starts at 6.5. Run the numbers:

| Case | Score shown |
|---|---|
| 4 panel raters (weight 1.3 each), all give 9 | (8×6.5 + 5.2×9) ÷ 13.2 = **7.5** |
| 20 raters (weight 1.0), average 8.5 | (8×6.5 + 20×8.5) ÷ 28 = **7.9** |
| 50 raters, average 8.5 | (8×6.5 + 50×8.5) ÷ 58 = **8.2** |

So for the first months, every score will sit between about 6.8 and 8.0. The maths is sound for ordering. The display is the problem. In a culture where 9/10 means "good", a card that says "#1 · 7.5" is hard for an owner or a fan to share with pride. Two options: make the rank and the number of raters large and the score small; or show both, "Score 7.5 · diners' average 9.0 from 4 raters".

One more effect of the same rule. When a dish passes 50 ratings, the starting point switches from 6.5 to the real city average, which may be near 8. Every score for that dish will jump that night, by up to about 0.9 for places with few raters. Explain it on the page, or phase the switch in.

**G. A ranked page will be names and numbers only.** Comments and photos are not public today. That suits a scoreboard, but it is thin for a reader and for Google. A cheap and safe addition: show the three sub-scores you already collect (taste, portion, value) as small bars. Later, add quick tags ("juicy", "small portion", "worth the price"). Tags need no moderation. Keep free-text comments private until you have time to moderate them, because free text carries legal risk (section 8.4).

## 6. Marketing strategy

### 6.1 What is wrong with the current plan

Section 1.2 goes through the plan line by line. The three big problems are:

1. **It markets a platform. People respond to an event.** "Rate dishes on our new site" gives nobody a reason to act today.
2. **It leans on friends for volume and on posts for reach.** Friends rate once. Posts fade in a day. Nothing in the plan brings a rater back.
3. **It saves the largest audiences for last** and then plans to "post" to them. Groups, creators and campuses are relationships. They take weeks to open. Start those conversations now.

### 6.2 The strategy I propose: one vote, one deadline, one partner

**Run the launch as a public vote with a closing date.**

> *Islamabad's best karahi, decided by Islamabad. Voting closes Sunday 20 December. Results on Monday 21 December.*

Why this fits you:

- **A deadline makes people act.** "Rate whenever" loses to everything else on a phone.
- **It gives you four things to announce** instead of one: nominations, voting, last week, results. Each is a reason to post again.
- **It puts all your ratings on two boards** (chicken and mutton karahi), so the lists become dense and believable.
- **Results are news.** A result gives a journalist, a creator and the winning restaurant something to share. A launch does not.
- **It needs no new code.** It needs dates, wording and one results page.
- **It repeats.** Nihari in December and January. Biryani in January. Sehri and iftar before Ramadan. Each season leaves a permanent results page.

The ranking stays live after each season. The "season result" is a dated snapshot, like a league table.

**Two rules keep the vote clean.**

1. *Ask every rater to score at least two places.* One person comparing two places tells you far more than two people each praising one. It also moves them to full weight under your own rule (three ratings at two or more restaurants).
2. *Do not ask restaurants to gather votes in season one.* Your burst rule holds ratings when five or more new accounts rate one dish at one place within 24 hours. A restaurant that rallies its fans will trigger that at once, and you cannot check those ratings fairly. Bring restaurants in after the results, to share them.

**Then borrow one audience.** Offer the format to one creator, one group admin or one campus society as their own vote. The pitch, in three lines:

> *You put the question to your audience. I run the vote and keep it clean. The result carries your name: "The [your name] Karahi Vote, counted by Kahan Khayen". No money either way.*

### 6.3 The channels you put off, re-checked

| Channel | Verdict | How |
|---|---|---|
| **Creators** (Instagram, TikTok, YouTube) | **Yes, small ones, as hosts of the vote.** | Only a third of twin-city respondents trust food vloggers, so a creator's praise is worth little. Their reach is worth a lot. Offer content, not money: your results for their "I tried the top three" video. Small accounts work on free meals or PKR 2,500–25,000 a Reel. The two big Islamabad accounts would cost PKR 150,000–750,000 by published bands. Never pay anyone to rate. Disclose any fee. |
| **Food festivals** | **Go as a visitor in December. No stall.** | A stall cost Rs 50,000–60,000 in 2022. A ticket costs Rs 700–2,500. Take a QR code on your phone, talk to people in queues, meet stall owners, take photos. |
| **Campus** | **Yes. Your best-fit audience. Prepare now, run 18 January to 7 February.** | Finals end in early January and Ramadan starts around 8 February. Set up the campus sectors first (H-8 to H-12, E-8, E-9, I-9). Offer one society a board of its own: "What FAST rates highest near campus". |
| **Restaurants as partners** | **Yes, after results.** | Send each of the top five a badge and a thank-you. Ask them to post it. In season two, give a QR card to *every* contender, so no place gains an unfair edge. |
| **QR counter cards** | **Pilot in December at two places. Fix the rule clash first.** | A working card will trip your burst rule on every busy evening. Decide the treatment before any card goes out: tag QR ratings by source, let them count at the new-account weight after a light check, and ask each QR rater to score one more place they know. |

### 6.4 A first-month calendar (11 November to 13 December)

Each week is 7–8 hours: about two on fixes, the rest on people. The targets are aims, about one and a half times my base case. The floor that tells you whether to continue is lower (section 10.4).

| Week | Dates | What you do | Target by Sunday |
|---|---|---|---|
| **0. Fix the first impression** | Wed 11 – Sun 15 Nov | Curate chicken and mutton karahi contenders: 12–15 in Islamabad, 8–10 in Rawalpindi. Hide unchecked places from lists. Rewrite the empty-state lines and the share preview. Add your name and contact to About. Add a source tag to every link you will share (`?s=wa`, `?s=rd`, `?s=ig`). Test sign-in on a real Android phone from WhatsApp, Facebook, Instagram, TikTok and LinkedIn. Write a list of 60–80 people to ask. | The site passes the "does it know my city?" test. |
| **1. Founding raters** | Mon 16 – Sun 22 Nov | Message ten people a day, one by one. Food-obsessed people first. Ask each for three things: rate two or more karahi places, name one missing place, send one photo. Thank each by first name. Put them in one small WhatsApp group. | 30 raters, 150 ratings, 3+ ranked places. |
| **2. Go public** | Mon 23 – Sun 29 Nov | Tue: r/islamabad post with the early ranking and "tell us why it's wrong". Wed: the build story on r/developersPak and LinkedIn. Fri–Sat: founding raters post the podium on WhatsApp status (weekends are when people choose where to eat). Open an Instagram account; first post tags the top three. Announce the closing date, 20 December. Reply to every comment the same day. | +50 raters. 80 in total. |
| **3. Second dish and partners** | Mon 30 Nov – Sun 6 Dec | Open nihari in both cities with checked contenders. Start a QR pilot at two friendly karahi places. Send the partner pitch to five small creators and two group admins. Post the first weekly "who moved" update. | 110 raters. One partner conversation open. |
| **4. Last-week push** | Mon 7 – Sun 13 Dec | "One week left" posts. Visit Pindi Food Fest if it runs. Prepare the results kit: a results page, a badge for the top three, a one-paragraph press note, and a draft article for Islamabad Scene. | 140 raters. Two boards with 5+ ranked places. |

After the month: voting closes on Sunday 20 December. Results go out on 21–22 December. Biryani opens in the last week of December. The campus window is 18 January to 7 February. Sehri and iftar lists go live by 25 January.

### 6.5 Hooks and messages

| Hook | English | Roman Urdu |
|---|---|---|
| The wrong ranking | "Our first 30 raters say X makes Islamabad's best karahi. Wrong? Fix it." | "Hamare pehle 30 raters kehte hain Islamabad ki best karahi X ki hai. Ghalat? Theek kar dein." |
| Against paid reviews | "No paid reviews. No free meals. Only numbers from people who ate there." | "Na paid review, na free khana. Sirf khanay walon ke number." |
| Settle the argument | "Butt or Shinwari? End the debate. Vote." | "Butt ya Shinwari? Behes khatam. Vote karein." |
| The deadline | "Voting closes 20 December. What number does your karahi place get?" | "Voting 20 December ko band. Aap ki karahi ka number kya hai?" |
| Drama | "X is three votes away from losing first place." | "X sirf teen vote door hai number 1 khonay se." |
| Office lunch | "Where is lunch from today? Check the vote." | "Aaj lunch kahan se? Vote dekh lein." |
| The biryani tease (for January) | "Does good biryani exist in Islamabad? Let's settle it." | "Islamabad mein achi biryani milti hai ya nahi? Faisla kar lein." |
| To an owner, after results | "Your mutton karahi is number two in Islamabad. We took no money from you, and we never will." | "Aap ki mutton karahi Islamabad mein number 2 hai. Hum ne paisay nahi liye, aur kabhi nahi lenge." |

The first hook is the strongest. People rarely answer a request to rate. They rush to correct a ranking they think is wrong. It is also completely honest: you say exactly how few raters you have.

The biryani tease rests on a real local argument. A 2021 ProPakistani piece about hunting for "real" biryani in the capital still draws comments, one saying the city lacks good biryani spots ([ProPakistani](https://propakistani.pk/2021/09/27/i-finally-found-the-best-read-real-biryani-in-islamabad/)).

**A Reddit post that works** has five parts: what it is in one line; why you built it (tired of paid reviews); the early ranking with the number of raters; how it works in two lines; and a small ask ("rate two places you've eaten at, and tell me which places are missing"). Say plainly that it is your project.

### 6.6 Partnerships to approach

Follower counts below come from third-party trackers. Check each account before you message it.

| Who | Why | Ask |
|---|---|---|
| Small and mid twin-city food accounts: @chaayebiscuit, @foodninjaoftwincities, @thefoodiechamber (about 49,000), @foodieexplorer101 (about 37,000) | Local, affordable, used to collaborations | Host the vote, or film "I tried the top three". |
| City pages: @islamabadians (about 417,000), @yourislamabad (about 147,000) | They need daily local content | Repost the results card. |
| Two or three active twin-city Facebook food groups (the only name I could confirm is "Islamabad Food Network") | The "best X?" question lives there | "Your group's official karahi vote." Speak to the admin first. |
| One student society at FAST, NUST, Bahria or Air | Dense, opinionated, time-rich | A campus board in the 18 January window. |
| Five software houses, through colleagues | Office lunch is a daily decision | A link in the lunch or food channel. |
| Islamabad Scene, Lovin Isloo | They publish Islamabad food stories | A results article with the method. |
| The top five restaurants, after results | They reshare praise | Post the badge. Later, host a QR card. |

### 6.7 A small paid test

**Not now.** Three reasons:

1. Ad clicks from Facebook and Instagram land in the in-app browser, where sign-in needs an extra step.
2. The sums do not work for buying raters. PKR 5,000 buys roughly 75–430 clicks. At a 2% rating rate that is 1–9 raters, or about PKR 600–3,300 each. A WhatsApp message costs nothing and converts ten times better.
3. TikTok's minimum is about PKR 13,800 per campaign.

**In January, one test is worth PKR 5,000:** use it to compare two hooks, not to buy raters.

| Item | Setting |
|---|---|
| Budget | PKR 5,000 in total: two ads at PKR 2,500 each, five days |
| Where | Islamabad and Rawalpindi, ages 18–34, Instagram and Facebook |
| Ads | The results card with hook 1 ("Wrong? Fix it") against hook 2 ("No paid reviews") |
| Measure | Cost per landing-page view; rating starts; completed ratings by source tag |
| Stop rule | If a new rater costs more than PKR 300, do not scale. Use the winning hook in your free posts. |

Pay with a local card that allows international payments. Expect about 4% in bank fees and a small advance tax on top.

### 6.8 What to measure

| Measure | Why | Aim by 13 December |
|---|---|---|
| New raters each week, panel and non-panel | The heartbeat | 30 a week by week 4 |
| Visit-to-rater rate, by source tag | Tells you whether the channel or the product is the problem | WhatsApp 25%+, Reddit 4%+, in-app browsers 1.5%+ |
| In-app sign-in: reached → completed | Decides whether you need a second sign-in method | 30%+ |
| Ratings per rater; share who rate two or more places | Data quality, and it unlocks full trust | 4+; 60%+ |
| Returning raters (rated in two different weeks) | Are people coming back? | 15%+ by January |
| Share taps, and visits from shares | Is the loop working? | Rising week on week |
| Live boards (3+ ranked; 5+ ranked) | The truth of the product | Two boards with 5+ |

Your admin already counts most of this. The missing piece is the **source tag**: without it you cannot tell which channel works.

## 7. Product gaps that block growth, ranked

| # | Gap | Why it blocks growth | What to do | Effort | When |
|---|---|---|---|---|---|
| 1 | **Contender list quality** | A local judges the site by the names on the list. Today the names are wrong (section 5.3). | Curate 12–15 checked contenders per dish. Hide unchecked places from lists. Rename, shuffle, add "Missing a place?". | 2–3 hours per dish, plus a small change | **Now** |
| 2 | **Empty-state wording and the share preview** | Every page and every WhatsApp preview says "nothing here". | Rewrite six lines (table in 5.3). Focus the home page on one or two live dishes. | 1–2 hours | **Now** |
| 3 | **No source tags** | You cannot tell which channel works. | A short tag on shared links, stored with the first rating, counted per week in admin. | 1–2 hours | **Now** |
| 4 | **Sign-in from social apps** | Google blocks its sign-in inside Facebook, Instagram, Messenger and TikTok. Google's own guide says ordinary websites opened inside other apps hit this ([Google](https://developers.google.com/identity/protocols/oauth2/web-server)). | Measure first. Make sure the tapped score travels with the "Open in Chrome" link. If fewer than 30% complete, add a second method: a six-digit code by email. A typed code keeps people inside the in-app browser. | 3–5 hours | Decide by 6 December |
| 5 | **Nothing comes back to the rater** | No reason to return or to share. | A "My top 3" share card. An earned "Trusted taster" level. Top weight earned by behaviour, not given by invite link. | 4–6 hours | Early December |
| 6 | **Chains split votes** | Five launch dishes are chain-heavy. | Rate at the branch, rank at the brand. | Medium. It touches the data model. | Before you feature pizza, zinger, burger, broast or shawarma |
| 7 | **No photos** | No appetite. Share cards are text only. | Cover photos for featured dishes. Approved diner photos on ranked rows (section 5.2). | 3–5 hours | December |
| 8 | **Campus areas missing** | H-8 to H-12, E-8, E-9 and I-9 hold the universities. | Add the sectors. Check 15–20 places near the campuses. | 1–2 hours | Before 18 January |
| 9 | **QR ratings and the burst rule clash** | A working card trips the rule every evening. | Tag QR ratings. Count them at new-account weight after a light check. Ask for a second place. | 1–2 hours | Before any card goes out |
| 10 | **Decay empties thin boards** | A place that just qualifies may drop off after about four months (section 2.5). | Lengthen the half-life to a year for now, or use decay for the score only. | 1 hour | Before February |
| 11 | **Scores look low** | "#1 · 7.5" is hard to share with pride (section 5.3). | Make rank and rater count large. Show the diners' average beside the score. | 1 hour | Before the first results |

**Sign-in options compared.**

| Method | Works inside in-app browsers? | Cost | Setup | Verdict |
|---|---|---|---|---|
| Google (today) | No, without "Open in Chrome" | Free | Done | Keep as the main method. |
| Code by email | Yes. The visitor types six digits and stays where they are. | Free up to about 100 sign-ins a day on Resend's free plan ([Resend](https://resend.com/pricing)). Supabase's built-in mailer cannot serve public sign-in, so a custom mail sender is required ([Supabase](https://supabase.com/docs/guides/auth/auth-smtp)). | A few hours | **The best second method.** New email accounts start at your lowest trust weight anyway. |
| Facebook Login | Probably inside Facebook's own browser; not confirmed by Meta | Free | Meta's rules point to Business Verification for public use, which is awkward for one person without a registered business ([Meta](https://developers.facebook.com/docs/development/release/business-verification)) | Skip. |
| Code by SMS | Yes | About Rs 4.75 per code from a local gateway, sold in Rs 10,000 packs ([SendPK](https://sendpk.com/price.php)). Twilio is about Rs 131 per code. | Medium | Not needed yet. |
| Code by WhatsApp | Yes | Charged per message. I could not read the Pakistan rate. Needs a Meta business account and an approved template. | High | Later, if ever. |
| Passkeys | Yes | Free | Marked experimental in Supabase | Watch, do not ship. |

**What to leave alone.**

| Item | Why leave it |
|---|---|
| **An Urdu interface** | Your first audience (urban, online, 18–34) reads English menus and delivery apps every day. English with warm Roman-Urdu lines is right. A right-to-left interface is a large job for a small gain now. |
| **An app-store app** | Google Play makes new personal accounts run a closed test with 12 testers for 14 days, plus a USD 25 fee ([Play Console](https://support.google.com/googleplay/android-developer/answer/14151465)). A bare wrapper also risks Play's "adds nothing" rule. The installable web app is enough until you pass 1,000 raters. |
| **Notifications you build yourself** | A WhatsApp Channel does the job for free: one weekly "who moved" post. It keeps raters. It does not find them. |
| **Checking all 1,264 listings** | Check the ~150 that will be contenders. Leave the rest searchable. |
| **Public free-text comments** | Legal risk and moderation time. Show sub-scores and tags instead. |
| **More owner tools, menu reading** | Built already. Freeze them. No owner will ask until rankings exist. |
| **More dishes, more cities** | Density first. Sixty-five ratings make one board. Spread over 38 boards, they make nothing. |

## 8. Business model

### 8.1 Will restaurants here pay? How much? When?

**Not yet. Possibly later, and only for proof of customers.**

What restaurants already pay for (facts):

- **Orders.** foodpanda's average commission is about 25% on an average order of about Rs 1,200 ([Dawn, Sept 2025](https://www.dawn.com/news/1941812)). A place with ten foodpanda orders a day hands over about Rs 90,000 a month (my arithmetic).
- **Tools that run the business.** Local restaurant software lists at USD 25–130 per branch per month, about PKR 7,000–36,000 ([Blink](https://www.blinkco.io/pricing/), [CORN POS](https://www.cornpos.com/pricing)). One vendor puts the usual market price of till software at Rs 1,500–5,000 a month ([Oscar](https://oscar.pk/solutions/free-pos)).

So your PKR 3,000–10,000 sits inside what restaurants pay for software. That is the good news.

The bad news is the closest local precedent. Food Connection Pakistan sold an online restaurant guide with reviews and photos. It reached about Rs 10 million a year. Then restaurants stopped renewing, because the guide could not show what business it had sent them ([Profit](https://profit.pakistantoday.com.pk/2017/10/09/a-bridge-between-restaurants-and-patrons)). A report is an optional purchase. An owner will ask one question: "kitne customer aaye?"

| Stage | Trigger | What you can honestly sell | Price | What to expect |
|---|---|---|---|---|
| Now | — | Nothing. Offer the free owner claim to build relationships. | 0 | 0 |
| First product | 1,000+ raters and 10,000+ visitors a month (base case: late 2027) | An owner report with countable outcomes: page views, taps on "Open in Google Maps", rank moves per dish, sub-scores against the city average | PKR 3,000–5,000 a month | 1–3% of Islamabad's 1,085 registered food points ([APP](https://www.app.com.pk/?p=1122698)) is 11–33 payers: PKR 33,000–165,000 a month (estimate, low confidence) |
| Second product | 50,000+ visitors a month | A season sponsor that is not a restaurant | Unknown. No local deal sizes are published. | One or two deals a year |

How long it took others: Zomato earned ad money from about its fourth year. Tripadvisor first charged restaurants in its seventeenth year. Beli still had no clear revenue model in its fifth year, after 75 million ratings (sources in section 2.3). **Revenue before year two is the exception.** Your "three paying restaurants by mid-April" target should go.

### 8.2 Other honest ways to make money

| Line | How it works | Honest? | Size | Comment |
|---|---|---|---|---|
| **Season sponsor** (a bank, telco, tea, cooking-oil or payments brand) | "Chai rankings, presented by …". The sponsor has no say in the ranking. | Yes | Unknown. My guess for a first deal is PKR 50,000–150,000. | Banks already buy exclusivity at food festivals, for example HabibMetro at Karachi Eat 2025 ([ProPakistani](https://propakistani.pk/2025/01/14/habibmetro-sponsored-the-karachi-eat-food-festival-2025-as-its-exclusive-banking-partner/)). Needs reach first. |
| **Owner reports** | As above | Yes | See 8.1 | Lead with numbers an owner can count. |
| **Paid profile extras on claimed pages** | Photos, menu, opening hours. Labelled "From the restaurant". No effect on rank. | Yes, if labelled | PKR 2,000–5,000 a month | Later. |
| **Running clean votes for others** | A newspaper, a festival, a campus or a brand pays you to run and count a vote | Yes | Project fees | Fits your skills. Could come earlier than restaurant money. |
| **foodpanda affiliate links** | Up to 9% per order, 7-day cookie ([foodpanda](https://www.foodpanda.pk/contents/affiliates)). At most about Rs 108 per order. | Yes, if disclosed and shown for every place | Small. 100 orders is about Rs 10,800. | Restaurants resent foodpanda's commission. It suits delivery dishes only. |
| **Display ads** | AdSense | Honest, ugly | About USD 40–80 per 100,000 page views (estimate, low confidence) | Not worth it. |
| **Donations** | "Keep the rankings independent" | Yes | Tiny | The only income Vercel's free plan allows. |
| **Winner plaques for a fee** | — | **Risky** | — | Consumer bodies call fee-for-plaque schemes "vanity awards" and say legitimate awards cost winners nothing ([BBB](https://www.bbb.org/article/business/21031-bbb-tip-vanity-awards)). Give the badge and a certificate free. Let a sponsor pay for plaques. |

Every review site that sold ads next to ratings spent years answering "pay to rank" claims, even where courts found nothing. "Rankings are never for sale" is the asset. Money from brands that are not restaurants, and analytics for owners, do not touch it.

### 8.3 Costs and platform rules

- Vercel's Hobby plan is for non-commercial use only. Taking payments, selling a product or running ads makes the site commercial and requires Pro at USD 20 a month ([Vercel](https://vercel.com/docs/limits/fair-use-guidelines)). Supabase Pro is USD 25 ([Supabase](https://supabase.com/pricing)).
- So the first rupee of revenue brings a fixed cost of about **PKR 12,450 a month**. Three to five report subscribers cover it.
- Until then your running cost is close to the domain fee. That is a real strength: you can keep this alive for years while you learn.

### 8.4 Legal notes

This is not legal advice. It reports what sources say, for your lawyer conversation.

| Point | What sources say |
|---|---|
| Criminal defamation online | The Islamabad High Court removed the words "or harms the reputation" from PECA section 20 in April 2022 ([Dawn](https://www.dawn.com/news/1684032)). |
| The 2025 PECA amendment | It created an offence of spreading "false and fake information" (up to three years) and a social-media regulator with removal powers ([Amnesty](https://www.amnesty.org/en/latest/news/2025/01/pakistan-authorities-pass-bill-with-sweeping-controls-on-social-media/)). The wording is broad. |
| Punjab | The Punjab Defamation Act 2024 is in force and under challenge ([Wikipedia](https://en.wikipedia.org/wiki/Punjab_Defamation_Act_2024)). It probably covers Rawalpindi listings; I could not confirm that. |
| Data protection | No data-protection law was in force as of March 2026 ([DLA Piper](https://www.dlapiperdataprotection.com/index.html?t=law&c=PK)). |
| Restaurants suing reviewers | I found no reported case. The search was cut short, so this is "not found", not "none". |

What protects you is how the product behaves, more than the documents:

- You publish numbers, not accusations. Keep free-text comments private.
- You already say "scores are diners' opinions". Keep that on every page.
- Give the dispute page a promise ("we reply within seven days") and keep a log of every decision.
- Show a real name and contact on the About page.
- My read of your draft Terms found no governing law, no limit of liability, no age rule and no complaint process with timelines. Ask your lawyer about those four.
- Before you charge anyone, ask about registering for tax as a sole proprietor.

### 8.5 The honest summary

In year one this is a project with option value, not an income. Two cities are unlikely to support a full-time living from restaurants alone. A real business would need brand sponsors, or Lahore and Karachi, or both. Do not expand before one city is dense. Every local and regional example that spread early died thin.

## 9. If I were you, starting today

Seven things I would do differently.

1. **Sell one answer, not a platform.** I would not show 38 empty lists. I would run one public vote with an end date: "Islamabad's best karahi, decided by Islamabad. Voting closes 20 December." One dish, two boards (chicken and mutton), twelve to fifteen checked contenders, one results day. A vote with a deadline gives people a reason to act now, gives you something to announce, and puts all your scarce ratings on one list.

2. **Recruit fifty food people, not fifty friends.** Friends rate once as a favour. Food-obsessed people rate again, argue, and bring others. I would hand-pick them from Reddit threads, food-group regulars, office lunch organisers and student food pages, and message each one myself. I would call them founding raters and thank them by first name on the site.

3. **Make trust something you earn, not something I hand out.** Today an invite link from me gives a rater the highest weight (1.3). I would give invited people normal weight with no probation, and give the top weight only for behaviour: many ratings, across many places, over several weeks, with no flags. That is fairer, safer if a link leaks, and it doubles as a status reward.

4. **Give every rater something back.** After rating, each person gets a small "My top 3 karahi in Islamabad" card with their name, ready for WhatsApp status. The site's podium is about the site. A personal list is about them. People share things about themselves.

5. **Borrow one audience.** I would offer the format to one creator, one group admin or one campus society as *their* league: they announce, their followers vote, they reveal the winner. I keep the method and the data honest. They bring the people I do not have.

6. **Plan backwards from Ramadan.** Ramadan should start around 8–9 February 2027. That is the biggest predictable food moment of the year, and it is 13 weeks away. I would want sehri and iftar lists (halwa puri, nihari, haleem, chai) live and indexed by 25 January. Everything before that is practice for it.

7. **Put the editor away.** You built a strong product in three weeks. That part is done. From today I would cap coding at two hours a week and spend the other five or six on people: messages, posts, replies, visits. I would also drop every revenue target until 1,000 people have rated. The only question for this winter is: *will strangers rate, and will they come back?*

## 10. The plan

### 10.1 Next 7 days (11–17 November): fix the first impression

About nine hours. No new features.

| # | Task | Time |
|---|---|---|
| 1 | Curate chicken and mutton karahi contenders in both cities (12–15 in Islamabad, 8–10 in Rawalpindi). Mark them checked. Hide unchecked places from lists. Rename the list "Contenders". Shuffle the order. | 3 h |
| 2 | Rewrite the empty-state lines, the badge and the share preview (table in 5.3). Make "Rate the places you know" the loud button. Give the header a solid background. | 1.5 h |
| 3 | About page: your name, why you built it, a contact address on your own domain, and "No restaurant has paid us. None can." | 0.5 h |
| 4 | Add source tags to shared links and count them in admin. | 1.5 h |
| 5 | Phone tests. Sign in from WhatsApp, Facebook, Instagram, TikTok and LinkedIn on a real Android phone and one iPhone. Count the taps. Then ask Google Maps: "which place has the best chicken karahi in Islamabad?" | 1 h |
| 6 | Write your list of 60–80 people and your one-to-one message. Reset your targets (below). | 1 h |
| 7 | Run the ten-minute technical checklist in section 4.4. | 0.5 h |

### 10.2 Next 30 days (to 13 December): the first vote

Follow the calendar in section 6.4. These are aims, not forecasts. By 13 December, aim to have:

- about 140 raters and 600 ratings;
- two karahi boards with five or more ranked places;
- nihari open in both cities;
- one partner conversation under way (a creator, an admin or a campus society);
- the "My top 3" card built, and top trust weight earned by behaviour;
- real numbers for the in-app sign-in step, and a decision on email codes;
- QR pilot data from two places;
- the lawyer's read of Privacy and Terms.

### 10.3 Next 90 days (to about 9 February): three seasons and Ramadan

| When | What |
|---|---|
| 20–22 December | Karahi voting closes. Results page, badges for the top three, a results article for Islamabad Scene, a results post on Reddit. |
| Late December | Biryani opens: "Does good biryani exist in Islamabad?" Diner photos go on. Design the chain model. |
| Early January | Check real search volumes in Keyword Planner. Request indexing for every board with three or more ranked places. |
| 18 January – 7 February | The campus window. Campus sectors added. One society runs a campus board. The PKR 5,000 hook test. |
| By 25 January | Sehri and iftar lists live for both cities: halwa puri, nihari, haleem, chai. |
| From about 8 February | Ramadan. "Sehri ka pehla number." |

Targets for 9 February: 180 or more raters, 800 or more ratings, five live boards, and 15% of raters returning in a second week.

### 10.4 Decision points

| Date | Question | If yes | If no |
|---|---|---|---|
| 22 Nov | Did 60+ direct asks produce 25+ raters? | Go public. | Stop. Watch five people use the site. Fix what trips them. |
| 6 Dec | Do 30%+ of in-app sign-in attempts complete? | Keep Google only. | Build email codes before any Facebook, Instagram or TikTok push. |
| 20 Dec | Do two boards have five or more ranked places? | Publish results. Open biryani. | Run karahi two more weeks. Do not open another dish. |
| 10 Jan | 100 raters, 500 ratings, 3 live boards? | Carry on to campus and Ramadan. | Rethink the format (10.5). |
| 7 Feb | 10+ new non-panel raters a week for three weeks? | Push through Ramadan. | Stop pushing. Choose a plan B. |
| 10 May | 300 raters and 8 live boards? | You have something alive. Think about year two. | Park or pivot. |

### 10.5 Stop-or-rethink signals

| Signal | Meaning | What to do |
|---|---|---|
| Fewer than 25 raters from 60 direct asks | The ask or the flow is broken | Usability test with five people |
| Under 2% of browser visitors rate | First impression fails | Fix lists and wording before buying or begging more traffic |
| Under 30% finish sign-in from social apps | Sign-in blocks your main audience | Email codes |
| Under 10% of raters come back | No loop | Personal features before more outreach |
| Under 100 raters by 10 January | The crowd format is not pulling | Plan B |
| Fewer than 10 new non-panel raters a week for three weeks, after two pushes | No pull without you | Plan B |

**Plan B options, all honest.**

- **The panel model.** Thirty to fifty vetted local food lovers rate dishes. The site says "ranked by our tasting panel". It needs far fewer people and breaks none of your rules.
- **The partner model.** You run clean votes for a creator, a group, a campus or a paper, under their name.
- **Park it.** Keep it live at almost no cost. Publish the build story. Try again before next winter with what you learned.

### 10.6 Top 10 recommendations, ranked by impact for effort

| # | Recommendation | Impact | Effort | Section |
|---|---|---|---|---|
| 1 | **Fix the contender lists before anyone sees them.** Curated, checked, renamed, shuffled. | Very high | 3 h per dish | 5.3 |
| 2 | **Stop announcing emptiness.** Rewrite six lines and the WhatsApp preview. Feature one or two dishes on the home page. | High | 2 h | 5.1, 4.4 |
| 3 | **Reset the targets.** 100 raters, 500 ratings and 3 live boards by 10 January. Drop the April revenue goal. | High | 0 h | 2.5, 8 |
| 4 | **Run a vote with a closing date, not a platform launch.** Karahi closes 20 December. | Very high | Wording and one results page | 6.2 |
| 5 | **Recruit 50 food people one by one.** Earn trust weight by behaviour; do not hand out 1.3 by link. | High | 4 h a week for two weeks | 6.4, 9 |
| 6 | **Launch with "wrong ranking, fix it"** on r/islamabad, r/developersPak, LinkedIn and WhatsApp status. | High | 3 h per post | 6.5 |
| 7 | **Measure the in-app sign-in step, then add email codes if under 30% finish.** Add source tags now. | High | 2 h now, 3–5 h later | 7 |
| 8 | **Give raters something back.** A "My top 3" card and an earned "Trusted taster" level. | High | 4–6 h | 7, 9 |
| 9 | **Plan backwards from Ramadan.** Sehri and iftar lists live by 25 January. Campus vote 18 January to 7 February. | High | Planning now | 1.3, 10.3 |
| 10 | **Add real photos in order:** covers by you and founding raters, then approved diner photos. No AI food. | Medium | 3–5 h | 5.2 |

Close behind: brand-level ranking for chains; one audience partner; a weekly "who moved" post; name and contact on the About page; a one-year half-life for the first year.

## Sources

Every source below is linked where it is used in the text. They are listed here by section, in order of first use. Data was read on 10–11 November 2026.

**1. Where we stand**

- en.dailypakistan.com.pk: [Daily Pakistan](https://en.dailypakistan.com.pk/02-Sep-2026/ramadan-2027-to-start-on-february-8-check-first-roza-eid-dates)
- blog.wego.com: [Wego](https://blog.wego.com/pakistan-ramadan-timetable/)
- en.dailypakistan.com.pk: [one example](https://en.dailypakistan.com.pk/26-Feb-2026/top-iftar-buffet-deals-in-islamabad-to-try-in-ramadan-2026)

**2. Market research and chances**

- pbs.gov.pk: [PBS census report](https://www.pbs.gov.pk/sites/default/files/population/2023/reports/District%20Census%20Report%202023-Islamabad.pdf)
- en.wikipedia.org: [Wikipedia, citing PBS](https://en.wikipedia.org/wiki/Rawalpindi)
- datareportal.com: [DataReportal Digital 2027](https://datareportal.com/reports/digital-2027-pakistan)
- bolnews.com: [Bol News](https://bolnews.com/technology/pakistan-leads-global-youtube-race-with-560-million-daily-views)
- gs.statcounter.com: [StatCounter OS](https://gs.statcounter.com/os-market-share/mobile/pakistan)
- gs.statcounter.com: [StatCounter search](https://gs.statcounter.com/search-engine-market-share/all/pakistan)
- dawn.com: [Dawn on HIES 2024-25](https://www.dawn.com/news/1964568)
- ipor.com.pk: [IPOR survey, Aug 2025](https://ipor.com.pk/uploads/68b54b0f2e3b4.pdf)
- jbr.cust.edu.pk: [Jinnah Business Review](https://jbr.cust.edu.pk/volumes/Ariticle-10-2-8.pdf)
- wanderlog.com: [Wanderlog snapshots of Google data](https://wanderlog.com/list/geoCategory/319341/)
- thefridaytimes.com: [Friday Times](https://thefridaytimes.com/14-Aug-2015/the-hunger-games)
- tribune.com.pk: [Express Tribune](https://tribune.com.pk/story/2037608/entertainment)
- gs.statcounter.com: [StatCounter](https://gs.statcounter.com/social-media-stats/all/pakistan)
- dawn.com: [Dawn](https://www.dawn.com/news/1184141)
- dawn.com: [Dawn](https://www.dawn.com/news/1963121/travel-food-dominate-tiktok-searches-in-2025)
- thenews.pk: [The News, Mar 2026](https://www.thenews.pk/magazine/money-matters/1405796-reels-and-buffets)
- aurora.dawn.com: [Aurora](https://aurora.dawn.com/news/1144867)
- dawn.com: [Dawn](https://www.dawn.com/news/1941812)
- propakistani.pk: [ProPakistani](https://propakistani.pk/2025/08/07/independent-study-by-lums-reveals-foodpandas-usd-1-2bn-economic-impact-on-pakistan-in-fy-2023-24/)
- foodpanda.pk: [foodpanda.pk](https://www.foodpanda.pk/city/islamabad)
- 9to5google.com: [9to5Google](https://9to5google.com/2026/08/06/google-ask-maps-global/)
- propakistani.pk: [ProPakistani](https://propakistani.pk/foodnama/)
- tripadvisor.com: [Tripadvisor](https://www.tripadvisor.com/Restaurants-g293960-Islamabad_Islamabad_Capital_Territory.html)
- profit.pakistantoday.com.pk: [Profit](https://profit.pakistantoday.com.pk/2025/02/28/pakistans-cashback-startup-savyour-to-completely-shutter-operations)
- propakistani.pk: [ProPakistani](https://propakistani.pk/?p=59014)
- profit.pakistantoday.com.pk: [Profit](https://profit.pakistantoday.com.pk/2017/10/09/a-bridge-between-restaurants-and-patrons)
- tribune.com.pk: [Express Tribune](https://tribune.com.pk/story/1391554/entertainment)
- tossdown.com: [Tossdown](https://tossdown.com/)
- chefstemp.com: [history](https://www.chefstemp.com/what-happened-to-foodspotting/)
- techcrunch.com: [TechCrunch](https://techcrunch.com/2013/10/07/forkly-the-foodspotting-competitor-from-brightkite-founders-is-shutting-down)
- techcrunch.com: [TechCrunch](https://techcrunch.com/2012/03/14/kevin-roses-oink-shuts-down)
- apps.apple.com: [example](https://apps.apple.com/us/app/onlyplates/id6478790810)
- bostonglobe.com: [Boston Globe](https://www.bostonglobe.com/2026/08/04/lifestyle/beli-restaurant-rating-app/)
- iveybusinessreview.ca: [Ivey Business Review](https://www.iveybusinessreview.ca/magazine/articles/beli)
- en.wikipedia.org: [Wikipedia](https://en.wikipedia.org/wiki/Letterboxd)
- nl.semrush.com: [Semrush estimate](https://nl.semrush.com/website/tasteatlas.com/overview)
- english.aaj.tv: [Aaj](https://english.aaj.tv/news/30346960)
- outlookbusiness.com: [Outlook Business](https://www.outlookbusiness.com/enterprise/big-idea/serving-it-hot-37)
- yourstory.com: [YourStory](https://yourstory.com/2017/07/burrp-bookmyshow-acquisition-what-next)
- cmxhub.com: [CMX](https://cmxhub.com/yelp-elite-nish-nadaraja-psychology)
- nngroup.com: [Nielsen Norman Group](https://www.nngroup.com/articles/participation-inequality/)
- pewresearch.org: [Pew, 2016](https://www.pewresearch.org/internet/2016/12/19/online-reviews/)
- andreyfradkin.com: [Fradkin et al.](https://andreyfradkin.com/assets/reviews_paper.pdf)
- pubsonline.informs.org: [Burtch et al.](https://pubsonline.informs.org/doi/10.1287/mnsc.2016.2715)
- journals.sagepub.com: [Woolley and Sharif](https://journals.sagepub.com/doi/10.1177/00222437211010439)
- searchengineland.com: [Search Engine Land](https://searchengineland.com/yelp-crushed-citysearch-yahoo-why-google-stealing-yelps-playbook-78623)
- cs.stanford.edu: [Stanford study](https://cs.stanford.edu/people/jure/pubs/badges-www13.pdf)

**3. Traffic**

- krausefx.com: [tested on iPhone in 2022](https://krausefx.com/blog/announcing-inappbrowsercom-see-what-javascript-commands-get-executed-in-an-in-app-browser)
- gummysearch.com: [GummySearch](https://gummysearch.com/r/islamabad/)
- ppc.land: [PPC Land](https://ppc.land/instagram-content-becomes-searchable-on-google-starting-july-10/)
- voosha.io: [Voosha](https://voosha.io/blog/influencer-rates-in-pakistan)
- collabscafe.com: [Collabscafe](https://collabscafe.com/blog/pakistan-influencer-rates-2026)
- visu.network: [Visu](https://visu.network/blog/track-review-qr-code-performance/)
- nu.edu.pk: [FAST](https://www.nu.edu.pk/Student/Calender)
- bahria.edu.pk: [Bahria](https://www.bahria.edu.pk/page/PageTemplate4?pageContentId=3172&websiteId=1)
- islamabadscene.com: [contribute page](https://www.islamabadscene.com/contribute/)
- app.com.pk: [APP](https://www.app.com.pk/?p=562274)
- tribune.com.pk: [Express Tribune](https://tribune.com.pk/story/2582171/pindi-food-fest-draws-hordes-of-foodies)

**4. SEO deep dive**

- semrush.com: [Semrush, foodpanda.pk](https://www.semrush.com/website/foodpanda.pk/overview/)
- pl.semrush.com: [Semrush, cheezious.com](https://pl.semrush.com/website/cheezious.com/overview)
- techcompanynews.com: [Synup study](https://www.techcompanynews.com/when-does-google-show-ai-overviews-for-local-searches-findings-from-synups-53900-page-study/)
- ahrefs.com: [Ahrefs, May 2025](https://ahrefs.com/blog/how-long-does-it-take-to-rank-in-google-and-how-old-are-top-ranking-pages/)
- developers.google.com: [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- developers.google.com: [Google review snippet rules](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- techjuice.pk: [TechJuice](https://techjuice.pk/7-beneficial-tips-for-startups-to-get-free-press-coverage/amp)
- news.ycombinator.com: [guidelines](https://news.ycombinator.com/showhn.html)
- support.google.com: [AI Overviews help](https://support.google.com/websearch/answer/14901683?hl=en)
- support.google.com: [AI Mode help](https://support.google.com/websearch/answer/16011537?hl=en)
- cloro.dev: [cloro](https://cloro.dev/blog/restaurant-seo/)
- pewresearch.org: [Pew, July 2025](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
- ahrefs.com: [Ahrefs, Feb 2026](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update)
- arxiv.org: [GEO paper](https://arxiv.org/html/2311.09735v3)
- searchenginejournal.com: [SE Ranking analysis, via SEJ](https://www.searchenginejournal.com/llms-txt-shows-no-clear-effect-on-ai-citations-based-on-300k-domains/)

**5. Design review**

- sciencedirect.com: [Spence et al., 2016](https://www.sciencedirect.com/science/article/pii/S0278262615300178)
- help.doordash.com: [DoorDash](https://help.doordash.com/en-us/merchants/article/doordash-photos-types)
- cloud.google.com: [Cloud Vision](https://cloud.google.com/vision/pricing)
- stock.adobe.com: [Adobe Stock](https://stock.adobe.com/plans)
- shutterstock.com: [Shutterstock](https://www.shutterstock.com/pricing)
- developers.google.com: [Google](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- sciencedirect.com: [Califano and Spence, 2024](https://www.sciencedirect.com/science/article/pii/S095032932400051X)
- 404media.co: [404 Media](https://www.404media.co/ghost-kitchens-are-advertising-ai-generated-food-on-doordash-and-grubhub/)
- blogpakistan.pk: [BlogPakistan](https://blogpakistan.pk/biryani-in-islamabad)
- tribune.com.pk: [Express Tribune](https://tribune.com.pk/story/2585337/biryani-still-rules-capitals-food-scene)

**6. Marketing strategy**

- propakistani.pk: [ProPakistani](https://propakistani.pk/2021/09/27/i-finally-found-the-best-read-real-biryani-in-islamabad/)

**7. Product gaps**

- developers.google.com: [Google](https://developers.google.com/identity/protocols/oauth2/web-server)
- resend.com: [Resend](https://resend.com/pricing)
- supabase.com: [Supabase](https://supabase.com/docs/guides/auth/auth-smtp)
- developers.facebook.com: [Meta](https://developers.facebook.com/docs/development/release/business-verification)
- sendpk.com: [SendPK](https://sendpk.com/price.php)
- support.google.com: [Play Console](https://support.google.com/googleplay/android-developer/answer/14151465)

**8. Business model**

- blinkco.io: [Blink](https://www.blinkco.io/pricing/)
- cornpos.com: [CORN POS](https://www.cornpos.com/pricing)
- oscar.pk: [Oscar](https://oscar.pk/solutions/free-pos)
- app.com.pk: [APP](https://www.app.com.pk/?p=1122698)
- propakistani.pk: [ProPakistani](https://propakistani.pk/2025/01/14/habibmetro-sponsored-the-karachi-eat-food-festival-2025-as-its-exclusive-banking-partner/)
- foodpanda.pk: [foodpanda](https://www.foodpanda.pk/contents/affiliates)
- bbb.org: [BBB](https://www.bbb.org/article/business/21031-bbb-tip-vanity-awards)
- vercel.com: [Vercel](https://vercel.com/docs/limits/fair-use-guidelines)
- supabase.com: [Supabase](https://supabase.com/pricing)
- dawn.com: [Dawn](https://www.dawn.com/news/1684032)
- amnesty.org: [Amnesty](https://www.amnesty.org/en/latest/news/2025/01/pakistan-authorities-pass-bill-with-sweeping-controls-on-social-media/)
- en.wikipedia.org: [Wikipedia](https://en.wikipedia.org/wiki/Punjab_Defamation_Act_2024)
- dlapiperdataprotection.com: [DLA Piper](https://www.dlapiperdataprotection.com/index.html?t=law&c=PK)

**Your own site, read on 11 November 2026**

- kahankhayen.com: home, /islamabad, /rawalpindi, /islamabad/best-chicken-biryani, /islamabad/best-chicken-karahi, /islamabad/best-pizza, /islamabad/r/butt-karahi-tikka-f-8, /how-rankings-work, /about, /about/data, /dispute, /privacy, /terms, robots.txt, sitemap.xml

