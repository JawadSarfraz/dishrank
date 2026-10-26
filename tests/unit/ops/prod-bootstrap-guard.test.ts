import { describe, expect, it } from "vitest";
import {
  assertSameDatabase,
  confirms,
  describeTarget,
  valuesToConfirm,
} from "@/server/services/prod-bootstrap-guard";

const HOST = "aws-1-ap-south-1.pooler.supabase.com";
const url = (port: number, extra = "", ref = "abcdefref") =>
  `postgresql://postgres.${ref}:s3cret-pw@${HOST}:${port}/postgres${extra}`;

describe("pnpm prod:bootstrap guard", () => {
  it("shows host, port, database, user and project, never the password; asks for host and ref", () => {
    const pooled = describeTarget("DATABASE_URL", url(6543, "?pgbouncer=true"));
    const session = describeTarget("DIRECT_URL", url(5432, "?sslmode=require"));
    expect(pooled).toEqual({
      name: "DATABASE_URL",
      host: HOST,
      port: "6543",
      database: "postgres",
      user: "postgres.abcdefref",
      projectRef: "abcdefref",
    });
    expect(JSON.stringify([pooled, session])).not.toContain("s3cret");
    expect(() => assertSameDatabase([pooled, session])).not.toThrow();
    // The pooler host is shared by every project of the region: the ref is asked for too.
    expect(valuesToConfirm([pooled, session])).toEqual([
      { label: "database host", value: HOST },
      { label: "Supabase project ref", value: "abcdefref" },
    ]);
  });

  it("runs only on exact answers; refuses unset, foreign, redirected or mismatched URLs", () => {
    expect(confirms(` ${HOST.toUpperCase()} `, HOST)).toBe(true);
    for (const answer of ["", "yes", "pooler.supabase.com", `${HOST}x`]) {
      expect(confirms(answer, HOST)).toBe(false);
    }
    for (const value of [
      undefined,
      "",
      "not a url",
      "mysql://u@h/db",
      url(5432, "?host=evil"),
      url(6543, "?user=postgres.otherref"),
      url(6543, "?port=5432"),
      `postgresql://postgres:pw@${HOST}:6543/postgres`, // a pooler user without the project ref
    ]) {
      expect(() => describeTarget("DIRECT_URL", value)).toThrow(/refused/);
    }
    const prod = describeTarget("DATABASE_URL", url(6543));
    const other = describeTarget("DIRECT_URL", url(5432, "", "otherref"));
    expect(() => assertSameDatabase([prod, other])).toThrow(/different databases/);
  });
});
