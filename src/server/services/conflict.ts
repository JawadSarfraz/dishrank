import { AppError } from "@/server/errors";
import { isUniqueViolation } from "@/server/repositories/transaction";

/** Maps a unique-constraint race (Prisma P2002) to CONFLICT (409) and rethrows anything else. */
export function rethrowConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new AppError(
      "CONFLICT",
      "This changed at the same time elsewhere. Reload and try again.",
      409,
    );
  }
  throw error;
}
