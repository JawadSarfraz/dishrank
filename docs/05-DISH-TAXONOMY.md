# 05 — Dish taxonomy and matching

The master dish list is `seed/dishes.json` (~80 dishes, 19 flagged `isLaunch`). Categories are in `seed/dish-categories.json`. Variant tags are in `seed/variant-tags.json`. Meat words are in `seed/meat-words.json`. At seed time every alias becomes a `DishAlias` row (docs/03).

## Rules of the taxonomy

1. **Meat type makes a different dish** when people compare them separately: Chicken Karahi ≠ Mutton Karahi ≠ Beef Karahi. Same for biryani, mandi, seekh kabab, handi, qorma.
2. **Preparation style is a variant tag**, not a dish: white, boneless, desi, Peshawari, Shinwari, makhni, achari, green. "White Chicken Karahi" → dish `chicken-karahi`, tags `[white]`.
3. **Size and price words are stripped and dropped**: Half/Full/1kg/Large and the rest of `size_words_strip_only`. "Chicken Karahi Full 1kg" → `chicken-karahi`, price kept in `RestaurantDish.price`. Single/Double/Family are variant tags (patty count or portion), not size words.
4. **Generic words map to the most common meat only when the alias says so.** "Biryani" alone → `chicken-biryani` (alias listed). "Karahi" alone → **no match** (needs meat) → review queue with suggestions chicken/mutton.
5. **A dish exists in the list if a diner would say "best X in the city".** Fries yes, "Raita" no.
6. Adding a dish is an admin action (from `DISH_PROPOSAL` review items). Users never create dishes.

## seed/dishes.json format

```json
{ "slug": "chicken-karahi", "name": "Chicken Karahi", "category": "karahi-handi",
  "isLaunch": true, "aliases": ["chicken karahi", "murgh karahi", "chicken kadai", "..."] }
```

- `prisma/seed.ts` loads every alias, plus `normalize(name)`, into the `DishAlias` table (docs/03): one row per spelling. Matching and dish search read only `DishAlias`.
- Aliases are lowercase and include Roman Urdu spellings. Every alias is stored already normalised (`normalize(alias) == alias`): no punctuation, no size words.
- An alias string belongs to one dish only (`DishAlias.alias` is unique).
- An alias may contain a variant word only when the word is part of the dish's identity ("cheese cake", "crispy chicken", "flat white", "chicken tikka pizza"). Otherwise leave the word out so it becomes a tag: "cheese burger" is not an alias, because "burger" matches and "cheese" becomes the tag.
- No alias may be a bare variant-tag word ("tikka", "namkeen").
- `seed/meat-words.json` lists the meat words per meat (chicken, mutton, beef, fish, prawn, veg, egg) and the dish words that need a meat (`needs_meat`). Meat words are never tags.

## Matching pipeline (`src/server/services/matching/`)

Used for: menu items from photos, restaurant-search "add dish" suggestions, admin tools.
**Match first, tag second**: find the dish from the whole text, then turn the words that are left over into tags.

```
input: rawName ("Chicken White Karahi Full 1kg Rs 2400")

1. normalize(rawName) → text
   - lowercase, unaccent, "&" → "and", every other character that is not a letter or digit → space
   - drop size phrases (seed/variant-tags.json → size_words_strip_only; longest first, whole words only)
   - drop price tokens: "rs", "pkr" and any token made only of digits
   - collapse spaces → "chicken white karahi"
   Variant words and meat words stay in the text.

2. aliasMatch(text)
   - find every DishAlias.alias that occurs in the text as consecutive whole words; keep the longest (most characters)
   - two different dishes tie for the longest alias → no dish; review with both suggested (confidence 0.60)
   - if no alias is found, or a leftover meat word conflicts (step 3), and the text has exactly one meat word:
     retry with that word moved to the front, then to the end; keep the first retry that matches without a conflict
     "chicken white karahi" → no alias → "white karahi chicken" contains "karahi chicken" → chicken-karahi

3. classify the leftover words (the text minus the words of the matched alias; longest tag phrase first)
   - variant tag word or phrase (seed/variant-tags.json → tags)          → tag       "white" → [white]
   - word of the matched dish's own name, or a stop word
     (and, with, n, e, ka, ki, ke, of, the, wala, wali, style)             → ignored
   - meat word: ignored if the dish's name names no meat (Pizza, Haleem) or the same meat
     (Namkeen Gosht = mutton); otherwise                                    → conflict
   - any other word                                                         → unknown
   Words inside the matched alias are never stripped and never become tags.
   confidence (method ALIAS): nothing unknown or conflicting → 1.0 · unknown words → 0.75 · conflict or tie → 0.60

4. trigramMatch(text), when step 2-3 did not reach 1.0
   SET LOCAL pg_trgm.similarity_threshold = 0.45;
   SELECT d.id, d.slug, max(similarity(a.alias, $text)) AS s
   FROM "DishAlias" a JOIN "Dish" d ON d.id = a."dishId"
   WHERE a.alias % $text                     -- served by the GIN trigram index
   GROUP BY d.id, d.slug
   ORDER BY s DESC
   LIMIT 10;
   - compares the text with one alias at a time (never a concatenated string) and keeps the best alias per dish
   - candidates need s ≥ 0.45; confidence = min(s, 0.80), so trigram alone never auto-creates a RestaurantDish
   - the top 3 dishes become review suggestions; all 10 go to step 5

5. llmMatch(text, candidates), menu uploads only, when steps 2-4 did not reach 0.85
   - Anthropic API, model from env ANTHROPIC_MATCH_MODEL, tool-use with schema
     { dishSlug: string | null, confidence: number, reason: string }
   - the prompt includes the alias suggestion (if any), the trigram candidates and category hints from rawSection
   - accept if confidence ≥ 0.85 → method LLM; otherwise keep the best suggestion

6. result → MenuItem.matchedDishId / matchConfidence / matchMethod / variantTags
   - confidence ≥ 0.85 → auto-create/upgrade RestaurantDish (status MENU_VERIFIED, source MENU_PHOTO)
   - 0.45-0.85 → ReviewItem UNMATCHED_MENU_ITEM with suggestions (alias match first, then trigram; at most 3 dishes)
   - < 0.45 or nothing → ReviewItem UNMATCHED_MENU_ITEM without suggestion
```

Meat-word safety: if the text contains a `needs_meat` word (karahi and its spellings, handi, biryani, mandi, seekh, qorma, pulao) and no meat word, TRIGRAM and LLM results are capped at 0.50, so they go to review. Alias matches are exempt, because a generic alias such as "biryani" → chicken-biryani is a deliberate seed decision (rule 4). This prevents "Karahi 1kg" silently becoming chicken.

### How the thresholds were chosen

Measured with `pg_trgm` against the seed (one alias at a time, best alias per dish):

| text | best dish (similarity) | runner-up | what it is |
|---|---|---|---|
| chikan kadhai | chicken-karahi 0.53 | mutton-karahi 0.33 | typo |
| beef burgar | beef-burger 0.57 | beef-bihari-boti 0.33 | typo |
| chiken karahi | chicken-karahi 0.71 | namkeen-gosht 0.38 | typo |
| zingar burger | zinger-burger 0.73 | beef-burger 0.50 | typo |
| shami kabab | bun-kabab 0.75 (alias "shami bun kabab") | beef-seekh-kabab 0.41 | a different dish |
| karahi | mutton-karahi 0.58, beef-karahi 0.58 | chicken-karahi 0.54 | meat missing |
| gola kabab | bun-kabab 0.40 | | not in the list |
| prawn karahi | beef-karahi 0.39 | | not in the list |
| raita | ras-malai 0.15 | | not in the list |

- 0.45 keeps every typo (0.53 and up) and drops dishes we do not list (0.40 and below).
- A missing word ("shami kabab", 0.75) scores higher than real typos (0.53-0.73), so no trigram score is safe for auto-creation. Trigram is capped at 0.80 and the LLM or an admin decides.
- The old "s ≥ 0.80 and gap ≥ 0.15" rule is removed: it could only fire for near-identical strings, which step 2 already matches.

## Test cases (`tests/unit/matching/`)

| rawName | expected dish | tags | method / confidence |
|---|---|---|---|
| Chicken Karahi (Full) | chicken-karahi | [] | ALIAS 1.0 |
| Murgh Karahi 1kg Rs.2200 | chicken-karahi | [] | ALIAS 1.0 |
| White Chicken Karahi Half | chicken-karahi | [white] | ALIAS 1.0 |
| Chicken White Karahi Full 1kg Rs 2400 | chicken-karahi | [white] | ALIAS 1.0, after the meat-word retry ("karahi chicken") |
| Mutton Peshawari Namkeen Karahi | namkeen-gosht | [peshawari] | ALIAS 1.0: longest alias "namkeen karahi"; "mutton" agrees with Namkeen Gosht |
| Chicken Namkeen Karahi | review: namkeen-gosht, chicken-karahi | [] | ALIAS 0.60: "chicken" conflicts with mutton |
| Karahi (per kg) | review: mutton-karahi, beef-karahi, chicken-karahi | [] | TRIGRAM, capped at 0.50 (no meat word) |
| Chikan Kadhai | review: chicken-karahi | [] | TRIGRAM 0.53; for menu uploads the LLM decides |
| Biryani | chicken-biryani | [] | ALIAS 1.0 |
| Prawn Biryani | review: chicken-biryani | [] | ALIAS 0.60: "prawn" conflicts with chicken |
| Beef Smash Burger Double | beef-burger | [double] | ALIAS 1.0 |
| Zinger Stacker | zinger-burger | [] | ALIAS 1.0 |
| Chicken Fajita Pizza Large | pizza | [fajita] | ALIAS 1.0: Pizza names no meat, so "chicken" is ignored |
| Chicken Tikka Pizza | pizza | [] | ALIAS 1.0: "tikka" is inside the alias "chicken tikka pizza" |
| Doodh Pati | chai | [] | ALIAS 1.0 |
| Raita | none | [] | NONE (not a ranked dish) |
| Dahi Bhaly Chaat | review: dahi-bhallay | [] | ALIAS 0.75: longest alias "dahi bhaly"; "chaat" is unknown |
| Fish Karahi | review: fish-fry | [] | ALIAS 0.75: "karahi" is unknown |
| Shami Kabab | review: bun-kabab | [] | TRIGRAM 0.75: a missing word never auto-creates |

Seed tests in the same folder: every alias equals `normalize(alias)`; no alias string maps to two dishes; every dish name and every alias matches its own dish at 1.0.

## Restaurant search (Roman Urdu tolerant)

`restaurants.searchText = lower(unaccent(name)) + ' ' + aliases` where aliases are admin-entered alternative names ("Butt Karahi", "Butt Karahi Lakshmi", "but karahi"). Query: trigram similarity ≥ 0.3 OR `ILIKE '%q%'`, ordered by similarity, limited to the selected city, `status = ACTIVE`, top 8.

## Adding a dish to a restaurant from the rate flow

1. User searches dish via `/api/v1/dishes?q=` (over `DishAlias`: `alias ILIKE '%q%'` or `similarity(alias, q) ≥ 0.3`, best alias per dish, launch dishes boosted).
2. Picks one → `POST /api/v1/restaurant-dishes` → creates `RestaurantDish` (status CANDIDATE, source USER, confidence 0.5) if absent.
3. The rating that follows counts toward `USER_CONFIRMED` (3 distinct raters).
4. If nothing matches, the user can submit a `DISH_PROPOSAL` (free text goes **only** into the review queue, never into `dishes`).
