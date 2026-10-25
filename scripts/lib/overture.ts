// Overture Maps places download and reader, shared by `pnpm overture:sync` and
// `pnpm research:overture`. DuckDB reads Overture's public S3 bucket (open data, no account, no
// Google). CLI only: @duckdb/node-api is a dev dependency and never reaches the app.
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { RELEASE_PATTERN, type OverturePlace } from "@/server/services/overture/places";

export const OUT_DIR = resolve("tmp/overture");
const STAC_CATALOG = "https://stac.overturemaps.org/catalog.json";
const S3_PLACES = (release: string) =>
  `s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*.parquet`;

export type Box = { west: number; south: number; east: number; north: number };

export const KM_PER_DEGREE = (6371 * Math.PI) / 180;

/** Box around every seed area centre, padded by `marginKm` (flat-earth degrees are fine at this size). */
export function seedBox(points: readonly { lat: number; lng: number }[], marginKm: number): Box {
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

/** The newest release in Overture's STAC catalog. */
export async function latestRelease(): Promise<string> {
  const res = await fetch(STAC_CATALOG);
  if (!res.ok) throw new Error(`STAC catalog: HTTP ${res.status}`);
  const catalog = (await res.json()) as { latest?: string };
  if (!catalog.latest || !RELEASE_PATTERN.test(catalog.latest)) {
    throw new Error("STAC catalog has no valid 'latest' release");
  }
  return catalog.latest;
}

/** `--name=value` (or a bare `--name`, "true") from the command line; pnpm's `--` is ignored. */
export function argValue(argv: readonly string[], name: string): string | undefined {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
}

export async function openDuckDb(): Promise<DuckDBConnection> {
  mkdirSync(OUT_DIR, { recursive: true });
  const db = await DuckDBInstance.create(":memory:", {
    extension_directory: resolve(OUT_DIR, "duckdb-extensions"),
  });
  return db.connect();
}

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * The places of `release` inside `box` as one local Parquet file in tmp/overture/, downloaded once
 * per release and box (a new margin or seed area downloads again; `refresh` forces it).
 */
export async function downloadPlaces(
  c: DuckDBConnection,
  release: string,
  box: Box,
  refresh = false,
): Promise<{ file: string; downloaded: boolean }> {
  if (!RELEASE_PATTERN.test(release)) throw new Error(`bad release: ${release}`);
  const boxKey = createHash("sha1").update(JSON.stringify(box)).digest("hex").slice(0, 8);
  const file = resolve(OUT_DIR, `places-${release}-${boxKey}.parquet`);
  const part = `${file}.part`;
  rmSync(part, { force: true });
  if (existsSync(file) && !refresh) return { file, downloaded: false };
  await c.run(`INSTALL httpfs; LOAD httpfs; SET s3_region = 'us-west-2';`);
  await c.run(`
    COPY (
      SELECT * FROM read_parquet(${sqlString(S3_PLACES(release))})
      WHERE bbox.xmin <= ${box.east} AND bbox.xmax >= ${box.west}
        AND bbox.ymin <= ${box.north} AND bbox.ymax >= ${box.south}
    ) TO ${sqlString(part)} (FORMAT parquet, COMPRESSION zstd)`);
  renameSync(part, file); // an interrupted download never looks like a finished one
  return { file, downloaded: true };
}

type Row = Record<string, unknown>;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const textOrNull = (value: unknown) => (typeof value === "string" ? value : null);

/**
 * Every place in a downloaded file, with the fields the sync uses. Sources are the whole-record
 * ones (property ''); single-property sources (Overture's confidence stamp, an operating status)
 * are left out.
 */
export async function readOverturePlaces(
  c: DuckDBConnection,
  file: string,
): Promise<OverturePlace[]> {
  const reader = await c.runAndReadAll(`
    SELECT id, names."primary" AS name,
      (bbox.ymin + bbox.ymax) / 2 AS lat, (bbox.xmin + bbox.xmax) / 2 AS lng,
      confidence, operating_status,
      taxonomy."primary" AS category,
      coalesce(taxonomy.alternates, []) AS alternates,
      coalesce(taxonomy.hierarchy, []) AS hierarchy,
      [coalesce(s.dataset, '') FOR s IN coalesce(sources, []) IF coalesce(s.property, '') = '']
        AS datasets,
      [coalesce(s.license, '') FOR s IN coalesce(sources, []) IF coalesce(s.property, '') = '']
        AS licenses,
      addresses[1].freeform AS address, addresses[1].locality AS locality,
      coalesce(phones, []) AS phones, coalesce(websites, []) AS websites
    FROM read_parquet(${sqlString(file)})
    ORDER BY id`);
  return (reader.getRowObjectsJson() as Row[]).map((r) => {
    const datasets = strings(r.datasets);
    const licenses = strings(r.licenses);
    return {
      id: String(r.id),
      name: textOrNull(r.name),
      lat: Number(r.lat),
      lng: Number(r.lng),
      confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
      operatingStatus: textOrNull(r.operating_status),
      category: textOrNull(r.category),
      alternates: strings(r.alternates),
      hierarchy: strings(r.hierarchy),
      sources: datasets.map((dataset, i) => ({ dataset, license: licenses[i] ?? "" })),
      address: textOrNull(r.address),
      locality: textOrNull(r.locality),
      phones: strings(r.phones),
      websites: strings(r.websites),
    };
  });
}
