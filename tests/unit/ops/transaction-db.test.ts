import { describe, expect, it } from "vitest";
import { inTransaction } from "@/server/repositories/transaction";

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
