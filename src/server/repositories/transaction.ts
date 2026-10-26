import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";

export type Tx = Prisma.TransactionClient;
export type Client = typeof db | Tx;

/**
 * Runs `fn` in one database transaction: any throw rolls every write back. A deadlock or
 * serialization failure (Prisma P2034) rolled everything back, so it is tried once more; a second
 * one answers 409 CONFLICT ("try again") instead of a server error.
 */
export async function inTransaction<T>(fn: (tx: Tx) => Promise<T>, timeoutMs = 30_000): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(fn, { timeout: timeoutMs, maxWait: 10_000 });
    } catch (error) {
      if (!isWriteConflict(error)) throw error;
      if (attempt >= 2) {
        throw new AppError("CONFLICT", "This changed at the same time elsewhere. Try again.", 409);
      }
    }
  }
}

/** A deadlock or serialization failure: the transaction was rolled back (Prisma P2034). */
export function isWriteConflict(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2034"
  );
}

/** True for a unique-constraint violation (Prisma P2002), e.g. two requests creating the same row. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}
