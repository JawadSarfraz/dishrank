// The DuckDB reader on a small Parquet file shaped like Overture's places theme (no network).
import { DuckDBInstance } from "@duckdb/node-api";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readOverturePlaces } from "../../../scripts/lib/overture";

const dir = mkdtempSync(join(tmpdir(), "dishrank-overture-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const FIXTURE = `
  SELECT * FROM (VALUES
    (
      '08f-fixture-a',
      {'primary': 'Fixture Pizza'}::STRUCT("primary" VARCHAR),
      {'xmin': 73.0569, 'xmax': 73.0569, 'ymin': 33.7215, 'ymax': 33.7215}
        ::STRUCT(xmin DOUBLE, xmax DOUBLE, ymin DOUBLE, ymax DOUBLE),
      0.91::DOUBLE,
      NULL::VARCHAR,
      {'primary': 'pizza_restaurant', 'alternates': ['fast_food_restaurant'],
        'hierarchy': ['food_and_drink', 'restaurant', 'pizza_restaurant']}
        ::STRUCT("primary" VARCHAR, alternates VARCHAR[], hierarchy VARCHAR[]),
      [{'property': '', 'dataset': 'meta', 'license': 'CDLA-Permissive-2.0'},
       {'property': '/properties/confidence', 'dataset': 'Overture', 'license': 'CDLA-Permissive-2.0'}]
        ::STRUCT(property VARCHAR, dataset VARCHAR, license VARCHAR)[],
      [{'freeform': 'Shop 1, F-7 Markaz', 'locality': 'Islamabad'}]
        ::STRUCT(freeform VARCHAR, locality VARCHAR)[],
      ['+92 51 1234567']::VARCHAR[],
      ['https://fixture-pizza.example']::VARCHAR[]
    ),
    ('08f-fixture-b', {'primary': NULL}, {'xmin': 73.1, 'xmax': 73.2, 'ymin': 33.6, 'ymax': 33.8},
      NULL, 'open', NULL, NULL, NULL, NULL, NULL)
  ) t(id, names, bbox, confidence, operating_status, taxonomy, sources, addresses, phones, websites)`;

describe("readOverturePlaces (scripts/lib/overture.ts)", () => {
  it("reads the fields the sync uses, with whole-record sources only and empty lists for nulls", async () => {
    const file = join(dir, "places.parquet");
    const c = await (await DuckDBInstance.create(":memory:")).connect();
    await c.run(`COPY (${FIXTURE}) TO '${file}' (FORMAT parquet)`);

    const places = await readOverturePlaces(c, file);
    expect(places).toEqual([
      {
        id: "08f-fixture-a",
        name: "Fixture Pizza",
        lat: 33.7215,
        lng: 73.0569,
        confidence: 0.91,
        operatingStatus: null,
        category: "pizza_restaurant",
        alternates: ["fast_food_restaurant"],
        hierarchy: ["food_and_drink", "restaurant", "pizza_restaurant"],
        sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }],
        address: "Shop 1, F-7 Markaz",
        locality: "Islamabad",
        phones: ["+92 51 1234567"],
        websites: ["https://fixture-pizza.example"],
      },
      {
        id: "08f-fixture-b",
        name: null,
        lat: 33.7,
        lng: 73.15,
        confidence: null,
        operatingStatus: "open",
        category: null,
        alternates: [],
        hierarchy: [],
        sources: [],
        address: null,
        locality: null,
        phones: [],
        websites: [],
      },
    ]);
  });
});
