// pnpm research:overture [--release=2026-10-21.0] [--refresh] [--margin-km=3]
// Research only (docs/research/overture-coverage.md). Downloads Overture Maps places (open data) for a box
// around seed/areas.json into tmp/overture/ and writes coverage tables as Markdown to
// tmp/overture/coverage-<release>.md. Never touches the app DB, never calls Google.
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import areas from "../../seed/areas.json";
import dishes from "../../seed/dishes.json";
import { cleanText, indexOfPhrase, tokenize } from "@/server/services/matching/normalize";

const OUT_DIR = resolve("tmp/overture");
const STAC_CATALOG = "https://stac.overturemaps.org/catalog.json";
const S3_PLACES = (release: string) =>
  `s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*.parquet`;

/** A place counts for an area when that area's centre is the nearest one and within this distance. */
const AREA_KM = 1.5;
/** ...and for a city when its nearest seed area centre (of that city) is within this distance. */
const CITY_KM = 3;
const CONFIDENCE_CUTOFF = 0.7;
const DUPLICATE_M = 50;
/** Same point (4 decimals, ~10 m) for this many places with mostly different addresses = a geocoder fallback. */
const PLACEHOLDER_MIN = 10;
const KNOWN_SAME_M = 100;
const SAMPLE_AREAS = ["f-6", "f-7", "blue-area", "g-9", "i-8"];
const SAMPLE_PER_AREA = 6;

/** Overture categories that point at a dish without naming it. Shown apart from real matches. */
const RELATED_CATEGORIES: Record<string, string[]> = {
  "namkeen-gosht": ["afghani_restaurant"],
  "kabuli-pulao": ["afghani_restaurant"],
  "chicken-mandi": ["arabian_restaurant", "middle_eastern_restaurant"],
  "beef-seekh-kabab": ["barbecue_restaurant", "bar_and_grill_restaurant"],
  "chapli-kabab": ["barbecue_restaurant", "afghani_restaurant"],
  "chicken-tikka": ["barbecue_restaurant", "bar_and_grill_restaurant"],
  "chicken-malai-boti": ["barbecue_restaurant", "bar_and_grill_restaurant"],
  "halwa-puri": ["breakfast_and_brunch_restaurant"],
  "zinger-burger": ["chicken_restaurant"],
  broast: ["chicken_restaurant", "chicken_wings_restaurant"],
  "chicken-shawarma": [
    "middle_eastern_restaurant",
    "lebanese_restaurant",
    "turkish_restaurant",
    "doner_kebab_restaurant",
  ],
  chai: ["tea_room"],
};

/** Words a signboard uses for the dish without the meat word ("Butt Karahi"). Shown apart from alias matches. */
const HEAD_WORDS: Record<string, string[]> = {
  "chicken-karahi": ["karahi", "karhai", "kadai", "kadhai", "karai", "kerahi"],
  "mutton-karahi": ["karahi", "karhai", "kadai", "kadhai", "karai", "kerahi"],
  "namkeen-gosht": ["namkeen"],
  "beef-seekh-kabab": ["kabab", "kebab", "kabob", "kababs", "kebabs"],
  "chicken-tikka": ["tikka", "tikkay", "tikkas"],
  "chicken-malai-boti": ["boti"],
};

/** "Sabzi Mandi", "Mandi Road": a market or a road, not the Arabic dish. */
const NOT_A_DISH: Record<string, { before: string[]; after: string[] }> = {
  mandi: {
    before: [
      "sabzi",
      "sabz",
      "bakar",
      "bakra",
      "namak",
      "ganj",
      "gawal",
      "cow",
      "fruit",
      "ghalla",
      "gur",
      "anaj",
    ],
    after: ["road", "rd", "more", "morr", "mor", "station", "bazar", "bazaar"],
  },
};

/** Known names to look for: `strong` = compact name contains one of these; `fuzzy` = Jaro-Winkler on words. */
const KNOWN_NAMES: { name: string; strong: string[]; fuzzy?: string }[] = [
  { name: "Savour Foods", strong: ["savourfoods", "savorfoods"], fuzzy: "savour foods" },
  { name: "Kabul Restaurant", strong: ["kabulrestaurant"], fuzzy: "kabul restaurant" },
  { name: "Chaaye Khana", strong: ["chaayekhana"], fuzzy: "chaaye khana" },
  { name: "Cheezious", strong: ["cheezious"], fuzzy: "cheezious" },
  { name: "Ranchers", strong: ["ranchers"], fuzzy: "ranchers" },
  { name: "OPTP", strong: ["optp", "onepotatotwopotato"] },
  { name: "Howdy", strong: ["howdy"], fuzzy: "howdy" },
  { name: "KFC", strong: ["kfc", "kentuckyfriedchicken"] },
  { name: "McDonald's", strong: ["mcdonald"], fuzzy: "mcdonalds" },
  { name: "Hardee's", strong: ["hardee"], fuzzy: "hardees" },
  { name: "Butt Karahi", strong: ["buttkarahi", "buttkarhai", "buttkadai"], fuzzy: "butt karahi" },
  { name: "The Rome Cafe", strong: ["romecafe"], fuzzy: "rome cafe" },
];
const FUZZY_MIN = 0.92;

/** Website values that are not the place's own site. */
const NOT_OWN_SITE =
  "facebook\\.com|fb\\.com|instagram\\.com|twitter\\.com|x\\.com|tiktok\\.com|youtube\\.com|wa\\.me|" +
  "whatsapp\\.com|linktr\\.ee|foodpanda|google\\.|goo\\.gl|share\\.google";
/** Google Maps links: an import must drop these (CLAUDE.md rule 2). */
const GOOGLE_MAPS =
  "google\\.[a-z.]+/maps|maps\\.google|maps\\.app\\.goo\\.gl|goo\\.gl/maps|share\\.google";

type Box = { west: number; south: number; east: number; north: number };

const KM_PER_DEGREE = (6371 * Math.PI) / 180;

/** Box around every seed area centre, padded by `marginKm` (flat-earth degrees are fine at this size). */
function seedBox(points: readonly { lat: number; lng: number }[], marginKm: number): Box {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const dLat = marginKm / KM_PER_DEGREE;
  const widest = Math.max(Math.abs(south), Math.abs(north));
  const dLng = marginKm / (KM_PER_DEGREE * Math.cos((widest * Math.PI) / 180));
  return {
    west: Math.min(...lngs) - dLng,
    south: south - dLat,
    east: Math.max(...lngs) + dLng,
    north: north + dLat,
  };
}

/** Jaro-Winkler similarity, 0..1. */
function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aHit = new Array<boolean>(a.length).fill(false);
  const bHit = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (bHit[j] || a[i] !== b[j]) continue;
      aHit[i] = bHit[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aHit[i]) continue;
    while (!bHit[k]) k++;
    if (a[i] !== b[k++]) transpositions++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Best Jaro-Winkler score of `target` against any run of the same number of words in `tokens`. */
function bestWordWindow(tokens: readonly string[], target: string): number {
  const size = tokenize(target).length;
  let best = 0;
  for (let i = 0; i + size <= tokens.length; i++) {
    best = Math.max(best, jaroWinkler(tokens.slice(i, i + size).join(" "), target));
  }
  return best;
}

const compact = (text: string) => cleanText(text).replace(/ /g, "");

/** True when `phrase` occurs in `tokens` as whole words, skipping hits that NOT_A_DISH rules out. */
function hasDishPhrase(tokens: readonly string[], phrase: readonly string[]): boolean {
  const rule = phrase.length === 1 ? NOT_A_DISH[phrase[0]] : undefined;
  for (let i = indexOfPhrase(tokens, phrase); i !== -1; i = indexOfPhrase(tokens, phrase, i + 1)) {
    if (!rule) return true;
    if (!rule.before.includes(tokens[i - 1] ?? "") && !rule.after.includes(tokens[i + 1] ?? ""))
      return true;
  }
  return false;
}

async function latestRelease(): Promise<string> {
  const res = await fetch(STAC_CATALOG);
  if (!res.ok) throw new Error(`STAC catalog: HTTP ${res.status}`);
  const catalog = (await res.json()) as { latest?: string };
  if (!catalog.latest) throw new Error("STAC catalog has no 'latest' release");
  return catalog.latest;
}

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
}

/** Copies the places inside `box` from Overture's public S3 bucket to one local Parquet file. */
async function extract(c: DuckDBConnection, release: string, box: Box, file: string) {
  const t0 = Date.now();
  const part = `${file}.part`;
  await c.run(`INSTALL httpfs; LOAD httpfs; SET s3_region = 'us-west-2';`);
  await c.run(`
    COPY (
      SELECT * FROM read_parquet('${S3_PLACES(release)}')
      WHERE bbox.xmin <= ${box.east} AND bbox.xmax >= ${box.west}
        AND bbox.ymin <= ${box.north} AND bbox.ymax >= ${box.south}
    ) TO '${part}' (FORMAT parquet, COMPRESSION zstd)`);
  renameSync(part, file); // an interrupted download never looks like a finished one
  console.error(`extracted ${release} in ${Math.round((Date.now() - t0) / 1000)} s → ${file}`);
}

// ---------- Markdown helpers ----------

type Cell = string | number | null | undefined;

const esc = (v: Cell) =>
  v === null || v === undefined
    ? ""
    : String(v)
        .replace(/[\r\n]+/g, " ")
        .replace(/\|/g, "\\|");

const NUMERIC = /^(–|[\d.,]+%?)$/;

function table(head: string[], rows: Cell[][]): string {
  const right = head.map((_, i) => rows.every((r) => NUMERIC.test(esc(r[i]) || "–")));
  return [
    `| ${head.join(" | ")} |`,
    `| ${right.map((r) => (r ? "--:" : "---")).join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
  ].join("\n");
}

const cityLabel = (slug: string) =>
  slug === "rest"
    ? `Rest of box (> ${CITY_KM} km from seed areas)`
    : slug === "placeholder"
      ? "Placeholder coordinates (location unknown)"
      : slug[0].toUpperCase() + slug.slice(1);
const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "–");
const num = (n: number) => n.toLocaleString("en-US");

// ---------- analysis ----------

type Row = Record<string, unknown>;

async function analyse(
  c: DuckDBConnection,
  file: string,
  release: string,
  box: Box,
): Promise<string> {
  const all = async (sql: string) => (await c.runAndReadAll(sql)).getRowObjectsJson() as Row[];
  const n = (v: unknown) => Number(v ?? 0);

  await c.run(
    `CREATE TABLE areas (city VARCHAR, slug VARCHAR, name VARCHAR, lat DOUBLE, lng DOUBLE)`,
  );
  const insert = await c.prepare(`INSERT INTO areas VALUES ($1, $2, $3, $4, $5)`);
  for (const a of areas) {
    insert.bindVarchar(1, a.city);
    insert.bindVarchar(2, a.slug);
    insert.bindVarchar(3, a.name);
    insert.bindDouble(4, a.lat);
    insert.bindDouble(5, a.lng);
    await insert.run();
  }

  // One row per place. `src` = whole-record sources (property ''); the 'Overture' entry only stamps confidence.
  await c.run(`
    CREATE TABLE base AS
    SELECT id, names."primary" AS name,
      (bbox.ymin + bbox.ymax) / 2 AS lat, (bbox.xmin + bbox.xmax) / 2 AS lng,
      confidence, operating_status,
      taxonomy."primary" AS category, coalesce(taxonomy.alternates, []) AS alternates,
      taxonomy.hierarchy[1] = 'food_and_drink'
        AND coalesce(taxonomy.hierarchy[2], '') <> 'alcoholic_beverage_venue' AS is_food,
      list_sort(list_distinct([s.dataset FOR s IN sources IF s.property = ''])) AS src,
      list_max([left(s.update_time, 10)::DATE FOR s IN sources IF s.property = '']) AS updated,
      coalesce(trim(addresses[1].freeform), '') <> '' AS has_address,
      coalesce(addresses[1].freeform, '') || ' ' || coalesce(addresses[1].locality, '') AS address_text,
      len(coalesce(phones, [])) > 0 AS has_phone,
      len(coalesce(websites, [])) > 0 AS has_website,
      list_bool_or([NOT regexp_matches(lower(w), '${NOT_OWN_SITE}') FOR w IN coalesce(websites, [])])
        IS TRUE AS has_own_website,
      len(coalesce(socials, [])) > 0 AS has_social,
      brand.names."primary" IS NOT NULL AS has_brand,
      len(string_split(trim(coalesce(addresses[1].freeform, '')), ' ')) <= 2 AS short_address,
      regexp_matches(coalesce(addresses[1].freeform, ''), '\\b[23456789CFGHJMPQRVWX]{4}\\+[23456789CFGHJMPQRVWX]{2,3}\\b')
        AS plus_code,
      regexp_matches(coalesce(addresses[1].locality, ''), '[\\x{0600}-\\x{06FF}]') AS urdu_locality,
      list_bool_or([regexp_matches(lower(w), '${GOOGLE_MAPS}') FOR w IN coalesce(websites, [])]) IS TRUE
        OR regexp_matches(lower(coalesce(addresses[1].freeform, '')), '${GOOGLE_MAPS}') AS google_maps_link,
      taxonomy IS NULL OR taxonomy."primary" IS NULL AS uncategorised
    FROM read_parquet('${file}')`);
  // Geocoder fallbacks: one rounded point holding many places with different addresses.
  await c.run(`
    CREATE TABLE placeholders AS
    SELECT round(lat, 4) AS rlat, round(lng, 4) AS rlng, count(*)::INT AS n FROM base
    GROUP BY 1, 2
    HAVING count(*) >= ${PLACEHOLDER_MIN} AND count(DISTINCT address_text) * 2 >= count(*)`);
  await c.run(`
    CREATE MACRO km(lat1, lng1, lat2, lng2) AS 2 * 6371 * asin(sqrt(
      pow(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * pow(sin(radians(lng2 - lng1) / 2), 2)))`);
  await c.run(`
    CREATE TABLE p AS
    SELECT b.*, n.area_slug, n.area_city, n.area_km, h.rlat IS NOT NULL AS placeholder,
      CASE WHEN h.rlat IS NOT NULL THEN 'placeholder' WHEN n.area_km <= ${CITY_KM} THEN n.area_city
        ELSE 'rest' END AS city,
      CASE WHEN h.rlat IS NULL AND n.area_km <= ${AREA_KM} THEN n.area_slug END AS area
    FROM base b
    LEFT JOIN placeholders h ON h.rlat = round(b.lat, 4) AND h.rlng = round(b.lng, 4)
    JOIN (
      SELECT b.id, arg_min(a.slug, km(b.lat, b.lng, a.lat, a.lng)) AS area_slug,
        arg_min(a.city, km(b.lat, b.lng, a.lat, a.lng)) AS area_city,
        min(km(b.lat, b.lng, a.lat, a.lng)) AS area_km
      FROM base b CROSS JOIN areas a GROUP BY b.id
    ) n USING (id)`);

  const out: string[] = [];
  const [tot] = await all(
    `SELECT count(*)::INT AS n, count(*) FILTER (is_food)::INT AS food,
      count(*) FILTER (uncategorised)::INT AS uncategorised,
      count(*) FILTER (placeholder)::INT AS placeholder,
      count(*) FILTER (placeholder AND is_food)::INT AS placeholder_food,
      (SELECT count(*) FROM placeholders)::INT AS points
     FROM p`,
  );
  out.push(
    `# Overture places coverage — release ${release}`,
    "",
    `Box (seed areas + margin): west ${box.west.toFixed(4)}, south ${box.south.toFixed(4)}, ` +
      `east ${box.east.toFixed(4)}, north ${box.north.toFixed(4)}. ` +
      `${num(n(tot.n))} places, ${num(n(tot.food))} food and drink.`,
    "",
    `Food and drink = taxonomy.hierarchy[1] = 'food_and_drink', without 'alcoholic_beverage_venue' ` +
      `(bars, lounges, hookah bars); ${num(n(tot.uncategorised))} places have no category and never count. ` +
      `City = city of the nearest seed area centre within ${CITY_KM} km ("rest" otherwise). ` +
      `Area = nearest seed area centre within ${AREA_KM} km. ` +
      `${num(n(tot.placeholder))} places (${num(n(tot.placeholder_food))} food) sit on ${n(tot.points)} ` +
      `placeholder points (≥ ${PLACEHOLDER_MIN} places, mostly different addresses, on one ~10 m spot) ` +
      `and get no city or area.`,
  );

  // 1. Per city and area
  const cities = await all(`
    SELECT city, count(*)::INT AS n, count(*) FILTER (is_food)::INT AS food,
      count(*) FILTER (is_food AND confidence >= ${CONFIDENCE_CUTOFF})::INT AS food_conf
    FROM p GROUP BY city
    ORDER BY CASE city WHEN 'islamabad' THEN 1 WHEN 'rawalpindi' THEN 2 WHEN 'rest' THEN 3 ELSE 4 END`);
  out.push(
    "",
    "## Places per city",
    "",
    table(
      ["City", "All places", "Food and drink", `Food, confidence ≥ ${CONFIDENCE_CUTOFF}`],
      [
        ...cities.map((r) => [
          cityLabel(String(r.city)),
          num(n(r.n)),
          num(n(r.food)),
          num(n(r.food_conf)),
        ]),
        [
          "Total",
          num(n(tot.n)),
          num(n(tot.food)),
          num(cities.reduce((s, r) => s + n(r.food_conf), 0)),
        ],
      ],
    ),
  );
  const perArea = await all(`
    SELECT a.city, a.name, count(p.id)::INT AS n, count(p.id) FILTER (p.is_food)::INT AS food,
      count(p.id) FILTER (p.is_food AND p.confidence >= ${CONFIDENCE_CUTOFF})::INT AS food_conf
    FROM areas a LEFT JOIN p ON p.area = a.slug
    GROUP BY a.city, a.name ORDER BY a.city, food DESC, a.name`);
  const [unassigned] = await all(
    `SELECT count(*)::INT AS n, count(*) FILTER (is_food)::INT AS food,
      count(*) FILTER (is_food AND confidence >= ${CONFIDENCE_CUTOFF})::INT AS food_conf
     FROM p WHERE area IS NULL AND NOT placeholder`,
  );
  out.push(
    "",
    "## Places per seed area",
    "",
    table(
      ["Area", "City", "All places", "Food and drink", `Food, confidence ≥ ${CONFIDENCE_CUTOFF}`],
      [
        ...perArea.map((r) => [
          String(r.name),
          cityLabel(String(r.city)),
          n(r.n),
          n(r.food),
          n(r.food_conf),
        ]),
        [
          `Not within ${AREA_KM} km of a seed area (placeholders left out)`,
          "",
          n(unassigned.n),
          n(unassigned.food),
          n(unassigned.food_conf),
        ],
      ],
    ),
  );

  // 2. Food by category
  const cats = await all(`
    SELECT coalesce(category, '(none)') AS category, count(*)::INT AS n,
      count(*) FILTER (city = 'islamabad')::INT AS isb, count(*) FILTER (city = 'rawalpindi')::INT AS rwp
    FROM p WHERE is_food GROUP BY 1 ORDER BY n DESC, category LIMIT 25`);
  out.push(
    "",
    "## Food and drink places by category (top 25)",
    "",
    table(
      ["Category", "Places", "Share", "Islamabad", "Rawalpindi"],
      cats.map((r) => [String(r.category), n(r.n), pct(n(r.n), n(tot.food)), n(r.isb), n(r.rwp)]),
    ),
  );

  // 3. Launch dishes
  const places = await all(`
    SELECT id, name, category, alternates, is_food, city, area, area_slug, area_km, placeholder,
      confidence, src, lat, lng, address_text
    FROM p ORDER BY md5(id)`);
  const food = places.filter((r) => r.is_food);
  const tokensById = new Map<string, string[]>();
  for (const r of places) tokensById.set(String(r.id), tokenize(cleanText(String(r.name ?? ""))));

  const dishRows: Cell[][] = [];
  for (const dish of dishes.filter((d) => d.isLaunch)) {
    const phrases = [...new Set([dish.name, ...dish.aliases].map(cleanText))]
      .filter(Boolean) // an Urdu-only alias cleans to "" and would match every name
      .map(tokenize);
    const hitsName = (r: Row) =>
      phrases.some((ph) => hasDishPhrase(tokensById.get(String(r.id)) ?? [], ph));
    const hitsCategory = (r: Row) =>
      [r.category, ...((r.alternates as string[]) ?? [])]
        .filter(Boolean)
        .some((cat) => phrases.some((ph) => hasDishPhrase(tokenize(cleanText(String(cat))), ph)));
    const byName = food.filter(hitsName);
    const byCategory = food.filter(hitsCategory);
    const either = food.filter((r) => hitsName(r) || hitsCategory(r));
    const nonFoodByName = places.filter((r) => !r.is_food && hitsName(r));
    const heads = HEAD_WORDS[dish.slug] ?? [];
    const headOnly = food.filter(
      (r) =>
        !hitsName(r) &&
        !hitsCategory(r) &&
        heads.some((h) => (tokensById.get(String(r.id)) ?? []).includes(h)),
    );
    const related = RELATED_CATEGORIES[dish.slug] ?? [];
    const relatedOnly = food.filter(
      (r) => !hitsName(r) && !hitsCategory(r) && related.includes(String(r.category)),
    );
    dishRows.push([
      dish.name,
      byName.length,
      byCategory.length,
      either.length,
      either.filter((r) => r.city === "islamabad").length,
      either.filter((r) => r.city === "rawalpindi").length,
      either.filter((r) => r.city !== "islamabad" && r.city !== "rawalpindi").length,
      nonFoodByName.length,
      heads.length ? `${headOnly.length} (${heads[0]})` : "–",
      related.length ? `${relatedOnly.length} (${related.join(", ")})` : "–",
      byName
        .slice(0, 3)
        .map((r) => String(r.name))
        .join("; "),
    ]);
  }
  out.push(
    "",
    "## Launch dishes: places whose name or category names the dish (lower bound)",
    "",
    "Matching = cleanText (docs/05 step 1 cleaning) on the place name and the category labels, then any " +
      "alias from seed/dishes.json as consecutive whole words, per dish (no docs/05 step 2 longest-alias " +
      "contest, so one name can count for two dishes; 'mandi' after sabzi/bakra/namak… or before road/more " +
      "is skipped). Food places only. 'Elsewhere' = rest of box or placeholder coordinates. 'Non-food name hits' have the dish in the name but a non-food category. " +
      "'Head word only' = the name has the dish word without the meat word (karahi, tikka, kabab…), so it " +
      "does not say which dish; both karahi rows count the same places. 'Related category only' places do " +
      "not name the dish at all. Neither of the last two columns is in 'Either'.",
    "",
    table(
      [
        "Dish",
        "Name",
        "Category",
        "Either",
        "Islamabad",
        "Rawalpindi",
        "Elsewhere",
        "Non-food name hits",
        "Head word only",
        "Related category only",
        "Examples",
      ],
      dishRows,
    ),
  );

  // 4. Data quality
  out.push("", "## Data quality");
  const sources = await all(`
    WITH s AS (SELECT is_food, unnest(src) AS dataset FROM p)
    SELECT dataset, count(*)::INT AS n, count(*) FILTER (is_food)::INT AS food FROM s
    GROUP BY 1 ORDER BY n DESC`);
  const licences = await all(`
    SELECT s.dataset, string_agg(DISTINCT s.license, ', ') AS licence
    FROM read_parquet('${file}'), unnest(sources) t(s) GROUP BY 1`);
  const licenceOf = new Map(licences.map((r) => [String(r.dataset), String(r.licence)]));
  const [multi] = await all(`
    SELECT count(*) FILTER (len(src) > 1)::INT AS n, count(*) FILTER (is_food AND len(src) > 1)::INT AS food,
      count(*) FILTER (len(src) = 0)::INT AS none FROM p`);
  const perProperty = await all(`
    SELECT s.dataset, s.property, count(*)::INT AS n
    FROM read_parquet('${file}'), unnest(sources) t(s) WHERE s.property <> '' GROUP BY 1, 2 ORDER BY n DESC`);
  out.push(
    "",
    "### Sources (places with at least one record from the dataset)",
    "",
    table(
      ["Dataset", "Licence", "All places", "Share", "Food", "Share of food"],
      sources.map((r) => [
        String(r.dataset),
        licenceOf.get(String(r.dataset)) ?? "",
        n(r.n),
        pct(n(r.n), n(tot.n)),
        n(r.food),
        pct(n(r.food), n(tot.food)),
      ]),
    ),
    "",
    `More than one whole-record source: ${num(n(multi.n))} places (${pct(n(multi.n), n(tot.n))}), ` +
      `${num(n(multi.food))} food; no whole-record source: ${num(n(multi.none))}. ` +
      `Single-property sources: ` +
      perProperty.map((r) => `${r.dataset} ${r.property} ${num(n(r.n))}`).join(", ") +
      ".",
  );

  const conf = await all(`
    SELECT CASE WHEN confidence IS NULL THEN 'unknown' WHEN confidence < 0.3 THEN '< 0.3'
      WHEN confidence < 0.5 THEN '0.3–0.5' WHEN confidence < 0.7 THEN '0.5–0.7'
      WHEN confidence < 0.9 THEN '0.7–0.9' ELSE '≥ 0.9' END AS bucket,
      count(*)::INT AS n, count(*) FILTER (is_food)::INT AS food
    FROM p GROUP BY 1 ORDER BY min(confidence) NULLS LAST`);
  const [median] = await all(`
    SELECT round(median(confidence), 2) AS all_, round(median(confidence) FILTER (is_food), 2) AS food FROM p`);
  out.push(
    "",
    "### Confidence",
    "",
    table(
      ["Confidence", "All places", "Share", "Food", "Share of food"],
      conf.map((r) => [
        String(r.bucket),
        n(r.n),
        pct(n(r.n), n(tot.n)),
        n(r.food),
        pct(n(r.food), n(tot.food)),
      ]),
    ),
    "",
    `Median confidence: all ${median.all_}, food ${median.food}.`,
  );

  const [fields] = await all(`
    SELECT count(*)::INT AS n, count(*) FILTER (has_address)::INT AS address,
      count(*) FILTER (has_phone)::INT AS phone, count(*) FILTER (has_website)::INT AS website,
      count(*) FILTER (has_own_website)::INT AS own_website,
      count(*) FILTER (has_social)::INT AS social,
      count(*) FILTER (has_website OR has_social)::INT AS web_or_social,
      count(*) FILTER (has_address AND has_phone)::INT AS address_and_phone,
      count(*) FILTER (has_brand)::INT AS brand,
      count(*) FILTER (has_address AND short_address)::INT AS short_address,
      count(*) FILTER (plus_code)::INT AS plus_code,
      count(*) FILTER (urdu_locality)::INT AS urdu_locality,
      count(*) FILTER (google_maps_link)::INT AS google_maps_link
    FROM p WHERE is_food`);
  const [googleAll] = await all(`SELECT count(*) FILTER (google_maps_link)::INT AS n FROM p`);
  const socialHosts = await all(`
    SELECT regexp_extract(lower(s), '^https?://(www\\.)?([^/]+)', 2) AS host, count(DISTINCT p.id)::INT AS n
    FROM p JOIN read_parquet('${file}') r USING (id), unnest(r.socials) t(s)
    WHERE p.is_food GROUP BY 1 ORDER BY n DESC LIMIT 3`);
  const f = (k: string) => [k, n(fields[k]), pct(n(fields[k]), n(fields.n))] as Cell[];
  out.push(
    "",
    "### Fields filled (food places)",
    "",
    table(
      ["Field", "Places", "Share"],
      [
        f("address"),
        f("phone"),
        f("website"),
        f("own_website"),
        f("social"),
        f("web_or_social"),
        f("address_and_phone"),
        f("brand"),
        f("short_address"),
        f("plus_code"),
        f("urdu_locality"),
        f("google_maps_link"),
      ],
    ),
    "",
    `address = non-empty freeform text; own_website = a website that is not a social, maps or delivery link; ` +
      `short_address = two words or fewer. Places with a social link, by host: ${socialHosts
        .map((r) => `${r.host} ${num(n(r.n))}`)
        .join(
          ", ",
        )}. Google Maps links (website or address) on all places: ${num(n(googleAll.n))}.`,
  );

  const released = `DATE '${release.slice(0, 10)}'`;
  const recency = await all(`
    WITH a AS (SELECT is_food, updated, date_diff('month', updated, ${released}) AS months FROM p)
    SELECT CASE WHEN updated IS NULL THEN 'unknown' WHEN months < 3 THEN 'under 3 months'
      WHEN months < 12 THEN '3–12 months' WHEN months < 24 THEN '1–2 years' ELSE 'over 2 years' END AS bucket,
      count(*)::INT AS n, count(*) FILTER (is_food)::INT AS food
    FROM a GROUP BY 1 ORDER BY max(updated) DESC NULLS LAST`);
  const stamps = await all(`
    WITH s AS (
      SELECT p.is_food, left(s.update_time, 10) AS day FROM p JOIN read_parquet('${file}') r USING (id),
        unnest(r.sources) t(s) WHERE s.property = '' AND s.dataset = 'meta'
    )
    SELECT mode(day) AS day, count(*)::INT AS n, count(*) FILTER (day = (SELECT mode(day) FROM s))::INT AS same,
      count(*) FILTER (is_food)::INT AS food,
      count(*) FILTER (is_food AND day = (SELECT mode(day) FROM s))::INT AS food_same
    FROM s`);
  const recencyBySource = await all(`
    WITH s AS (SELECT is_food, unnest(sources) AS s FROM read_parquet('${file}') r,
      LATERAL (SELECT taxonomy.hierarchy[1] = 'food_and_drink' AS is_food))
    SELECT s.dataset, min(left(s.update_time, 10)) AS oldest, max(left(s.update_time, 10)) AS newest,
      median(left(s.update_time, 10)::DATE)::DATE::VARCHAR AS median
    FROM s WHERE s.property = '' GROUP BY 1 ORDER BY 1`);
  const status = await all(
    `SELECT coalesce(operating_status, '(not set)') AS status, count(*)::INT AS n FROM p WHERE is_food GROUP BY 1 ORDER BY n DESC`,
  );
  out.push(
    "",
    `### Last update (newest whole-record source per place, age at release ${release})`,
    "",
    table(
      ["Age", "All places", "Food"],
      recency.map((r) => [String(r.bucket), n(r.n), n(r.food)]),
    ),
    "",
    table(
      ["Dataset", "Oldest", "Median", "Newest"],
      recencyBySource.map((r) => [
        String(r.dataset),
        String(r.oldest),
        String(r.median),
        String(r.newest),
      ]),
    ),
    "",
    `Meta records stamped ${stamps[0]?.day}: ${num(n(stamps[0]?.same))} of ${num(n(stamps[0]?.n))} ` +
      `(food ${num(n(stamps[0]?.food_same))} of ${num(n(stamps[0]?.food))}), so this date is Meta's export, ` +
      `not a check that the place still trades. ` +
      `Operating status (food): ${status.map((r) => `${r.status} ${num(n(r.n))}`).join(", ")}.`,
  );

  // Only the locality field: freeform text names roads after cities (Murree Rd, Peshawar Mor, Karachi Company).
  const OTHER_CITIES =
    "lahore|karachi|peshawar|multan|faisalabad|gujranwala|sialkot|quetta|hyderabad|abbottabad|murree|" +
    "dera ismail khan|sargodha|bahawalpur|jhelum|gujrat|mardan|swat|attock|chiniot|taxila|wah|" +
    "gujar khan|gujarkhan|chakwal|bagh|keran|muzaffarabad|mirpur|kotli";
  const elsewhere = await all(`
    SELECT p.name, r.addresses[1].locality AS locality FROM p JOIN read_parquet('${file}') r USING (id)
    WHERE p.is_food AND regexp_full_match(lower(trim(r.addresses[1].locality)), '${OTHER_CITIES}')
    ORDER BY md5(p.id)`);
  out.push(
    "",
    "### Location sanity",
    "",
    `${elsewhere.length} food places inside the box give a town outside the twin cities as the address locality: ` +
      elsewhere.map((r) => `"${esc(String(r.name))}" (${esc(String(r.locality))})`).join("; ") +
      ".",
  );

  // Prefilter box a little wider than DUPLICATE_M, at the box's widest latitude.
  const dLat = (DUPLICATE_M * 1.1) / 1000 / KM_PER_DEGREE;
  const dLng =
    dLat / Math.cos((Math.max(Math.abs(box.south), Math.abs(box.north)) * Math.PI) / 180);
  const dupes = await all(`
    WITH f AS (
      SELECT id, name, lat, lng, src, is_food,
        coalesce(nullif(regexp_replace(lower(strip_accents(name)), '[^a-z0-9]+', '', 'g'), ''), name) AS key
      FROM p WHERE name IS NOT NULL
    )
    SELECT a.is_food AND b.is_food AS food, a.name AS a_name, b.name AS b_name,
      round(1000 * km(a.lat, a.lng, b.lat, b.lng))::INT AS metres, a.src AS a_src, b.src AS b_src,
      a.id AS a_id, b.id AS b_id
    FROM f a JOIN f b ON a.id < b.id
      AND b.lat BETWEEN a.lat - ${dLat} AND a.lat + ${dLat} AND b.lng BETWEEN a.lng - ${dLng} AND a.lng + ${dLng}
    WHERE 1000 * km(a.lat, a.lng, b.lat, b.lng) <= ${DUPLICATE_M}
      AND (a.key = b.key OR (length(a.key) >= 4 AND length(b.key) >= 4
        AND (jaro_winkler_similarity(a.key, b.key) >= 0.9 OR contains(a.key, b.key) OR contains(b.key, a.key))))
    ORDER BY md5(a.id), md5(b.id)`);
  const dupeSummary = (rows: Row[], of: number) => {
    const ids = new Set(rows.flatMap((r) => [String(r.a_id), String(r.b_id)]));
    const same = rows.filter((r) => String(r.a_src) === String(r.b_src)).length;
    return [rows.length, ids.size, pct(ids.size, of), same, rows.length - same] as Cell[];
  };
  const foodDupes = dupes.filter((r) => r.food);
  out.push(
    "",
    `### Likely duplicates (same or similar name within ${DUPLICATE_M} m)`,
    "",
    "Similar = names equal after lowercasing and dropping non-letters, or (both at least 4 letters) " +
      "Jaro-Winkler ≥ 0.9 or one name contains the other. A floor: the same shop under two names " +
      '("OPTP" / "One Potato Two Potato") is not caught.',
    "",
    table(
      [
        "Scope",
        "Pairs",
        "Places in a pair",
        "Share",
        "Pairs from the same source set",
        "Cross-source pairs",
      ],
      [
        ["Food (both food)", ...dupeSummary(foodDupes, n(tot.food))],
        ["All places", ...dupeSummary(dupes, n(tot.n))],
      ],
    ),
    "",
    "Examples (food): " +
      foodDupes
        .slice(0, 8)
        .map((r) => `"${esc(String(r.a_name))}" / "${esc(String(r.b_name))}" ${r.metres} m`)
        .join("; ") +
      ".",
  );

  // 5. Known names
  const areaName = new Map(areas.map((a) => [a.slug, a.name]));
  const where = (r: Row) =>
    r.placeholder
      ? "placeholder point"
      : r.area
        ? (areaName.get(String(r.area)) ?? String(r.area))
        : `near ${areaName.get(String(r.area_slug)) ?? r.area_slug} (${n(r.area_km).toFixed(1)} km)`;
  const metres = (a: Row, b: Row) => {
    const rad = Math.PI / 180;
    const dLa = (n(b.lat) - n(a.lat)) * rad;
    const dLo = (n(b.lng) - n(a.lng)) * rad;
    const h =
      Math.sin(dLa / 2) ** 2 +
      Math.cos(n(a.lat) * rad) * Math.cos(n(b.lat) * rad) * Math.sin(dLo / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  };
  /** Records of one brand that are close together or share an address are counted once. */
  const distinct = (rows: Row[]) => {
    const kept: Row[] = [];
    const addressKey = (r: Row) => {
      const key = cleanText(String(r.address_text ?? ""));
      return tokenize(key).length >= 3 ? key : null;
    };
    for (const r of [...rows].sort((a, b) => n(b.confidence) - n(a.confidence))) {
      const same = kept.some(
        (k) =>
          (!r.placeholder && !k.placeholder && metres(k, r) <= KNOWN_SAME_M) ||
          (addressKey(r) !== null && addressKey(r) === addressKey(k)),
      );
      if (!same) kept.push(r);
    }
    return kept.length;
  };
  const knownRows: Cell[][] = [];
  for (const k of KNOWN_NAMES) {
    const strong = places.filter((r) =>
      k.strong.some((s) => compact(String(r.name ?? "")).includes(s)),
    );
    const strongIds = new Set(strong.map((r) => r.id));
    const fuzzy = k.fuzzy
      ? food.filter(
          (r) =>
            !strongIds.has(r.id) &&
            bestWordWindow(tokensById.get(String(r.id)) ?? [], k.fuzzy!) >= FUZZY_MIN,
        )
      : [];
    const counts = new Map<string, number>();
    for (const r of strong) counts.set(where(r), (counts.get(where(r)) ?? 0) + 1);
    knownRows.push([
      k.name,
      strong.length ? "found" : fuzzy.length ? "fuzzy only" : "not found",
      strong.length,
      distinct(strong),
      strong.filter((r) => r.is_food).length,
      [...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([w, c]) => (c > 1 ? `${w} ×${c}` : w))
        .join(", "),
      [...new Set(strong.map((r) => String(r.name)))].slice(0, 3).join("; "),
      fuzzy
        .slice(0, 4)
        .map((r) => `${r.name} (${where(r)})`)
        .join("; "),
    ]);
  }
  out.push(
    "",
    "## Known names",
    "",
    `Found = the compact name (lowercase, letters and digits only) contains the name or a listed spelling; ` +
      `any category. Fuzzy = a food place where some run of words scores Jaro-Winkler ≥ ${FUZZY_MIN} and is not already a match. ` +
      `Area = nearest seed area centre within ${AREA_KM} km, else the nearest centre and its distance. ` +
      `Distinct ≈ records within ${KNOWN_SAME_M} m of each other or with the same address counted once.`,
    "",
    table(
      [
        "Name",
        "Result",
        "Records",
        "Distinct ≈",
        "Food-category records",
        "Where",
        "Overture names",
        "Fuzzy-only candidates",
      ],
      knownRows,
    ),
  );

  // 6. Random sample
  const sample = await all(`
    SELECT a.name AS area, p.name, p.category, round(p.confidence, 2) AS confidence, array_to_string(p.src, ', ') AS src
    FROM p JOIN areas a ON a.slug = p.area
    WHERE p.is_food AND p.area IN (${SAMPLE_AREAS.map((s) => `'${s}'`).join(", ")})
    QUALIFY row_number() OVER (PARTITION BY p.area ORDER BY md5(p.id)) <= ${SAMPLE_PER_AREA}
    ORDER BY list_position([${SAMPLE_AREAS.map((s) => `'${s}'`).join(", ")}], p.area), md5(p.id)`);
  out.push(
    "",
    `## Sample: ${SAMPLE_PER_AREA} food places each from ${SAMPLE_AREAS.join(", ")} (fixed md5(id) order)`,
    "",
    table(
      ["Area", "Name", "Category", "Confidence", "Sources"],
      sample.map((r) => [
        String(r.area),
        String(r.name),
        String(r.category),
        n(r.confidence),
        String(r.src),
      ]),
    ),
  );
  return out.join("\n") + "\n";
}

async function main() {
  const release = arg("release") ?? (await latestRelease());
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(release)) throw new Error(`bad release: ${release}`);
  const marginKm = Number(arg("margin-km") ?? 3);
  if (!Number.isFinite(marginKm) || marginKm <= 0)
    throw new Error(`bad --margin-km: ${arg("margin-km")}`);
  const box = seedBox(areas, marginKm);
  mkdirSync(OUT_DIR, { recursive: true });
  // The cache is per release and box, so a new margin or a new seed area re-downloads.
  const boxKey = createHash("sha1").update(JSON.stringify(box)).digest("hex").slice(0, 8);
  const file = resolve(OUT_DIR, `places-${release}-${boxKey}.parquet`);
  rmSync(`${file}.part`, { force: true });

  const db = await DuckDBInstance.create(":memory:", {
    extension_directory: resolve(OUT_DIR, "duckdb-extensions"),
  });
  const c = await db.connect();
  if (!existsSync(file) || arg("refresh") === "true") await extract(c, release, box, file);
  const report = await analyse(c, file, release, box);
  const reportFile = resolve(OUT_DIR, `coverage-${release}.md`);
  writeFileSync(reportFile, report);
  console.error(`wrote ${reportFile}`);
}

main().catch((error: unknown) => {
  console.error("research:overture failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
