import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { inTransaction, isWriteConflict, type Tx } from "@/server/repositories/transaction";
import { resetAppData } from "../../setup/db-reset";
import { makeUser } from "../restaurants/fixtures";

/** What Prisma throws for a deadlock or serialization failure (PostgreSQL 40P01 / 40001). */
const writeConflict = () => Object.assign(new Error("deadlock detected"), { code: "P2034" });

describe("inTransaction (test DB)", () => {
  it("tries a deadlocked transaction once more, then answers 409 CONFLICT", async () => {
    let calls = 0;
    const once = await inTransaction(async () => {
      calls += 1;
      if (calls === 1) throw writeConflict();
      return "ok";
    });
    expect(once).toBe("ok");
    expect(calls).toBe(2);

    calls = 0;
    await expect(
      inTransaction(async () => {
        calls += 1;
        throw writeConflict();
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(calls).toBe(2);
  });

  it("passes every other error through, without a retry", async () => {
    let calls = 0;
    await expect(
      inTransaction(async () => {
        calls += 1;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });
});

describe("a real deadlock between two raw lock statements (test DB)", () => {
  afterAll(resetAppData);

  /** Two transactions that lock two user rows in opposite orders, so PostgreSQL aborts one. */
  async function deadlockPair(run: (fn: (tx: Tx) => Promise<void>) => Promise<unknown>) {
    await resetAppData();
    const [a, b] = await Promise.all([makeUser("Lock A"), makeUser("Lock B")]);
    let lockedA!: () => void;
    let lockedB!: () => void;
    const aHeld = new Promise<void>((resolve) => (lockedA = resolve));
    const bHeld = new Promise<void>((resolve) => (lockedB = resolve));
    const lock = (tx: Tx, id: string) =>
      tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
    return Promise.allSettled([
      run(async (tx) => {
        await lock(tx, a.id);
        lockedA();
        await bHeld;
        await lock(tx, b.id);
      }),
      run(async (tx) => {
        await lock(tx, b.id);
        lockedB();
        await aHeld;
        await lock(tx, a.id);
      }),
    ]);
  }

  it("is recognised as a write conflict although Prisma reports it as P2010", async () => {
    const results = await deadlockPair((fn) => db.$transaction(fn, { timeout: 15_000 }));
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatchObject({ code: "P2010" });
    expect(isWriteConflict(failed[0].reason)).toBe(true);
  }, 30_000);

  it("is retried by inTransaction, so both transactions end up committed", async () => {
    const results = await deadlockPair((fn) => inTransaction(fn));
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  }, 30_000);
});
