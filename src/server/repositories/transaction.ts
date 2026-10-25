import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export type Tx = Prisma.TransactionClient;
export type Client = typeof db | Tx;

/** Runs `fn` in one database transaction: any throw rolls every write back. */
export function inTransaction<T>(fn: (tx: Tx) => Promise<T>, timeoutMs = 30_000): Promise<T> {
  return db.$transaction(fn, { timeout: timeoutMs, maxWait: 10_000 });
}

/** True for a unique-constraint violation (Prisma P2002), e.g. two requests creating the same row. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}
