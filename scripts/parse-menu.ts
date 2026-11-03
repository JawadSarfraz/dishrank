// pnpm menu:parse -- --upload=<menuUploadId>: reads one PENDING or FAILED menu photo with the
// vision model and matches its items (docs/07 §3), the same code as "Parse now". It counts toward
// the 50-a-day cap. Run outside Next.js, it cannot revalidate pages: they update within the hour.
import "dotenv/config";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { parseMenuUpload } from "@/server/services/menu.service";

function uploadId(argv: readonly string[]): string | null {
  const arg = argv.find((a) => a.startsWith("--upload="));
  const value = arg?.slice("--upload=".length).trim();
  return value && /^[a-z0-9]{8,64}$/.test(value) ? value : null;
}

async function main(): Promise<number> {
  const id = uploadId(process.argv.slice(2));
  if (!id) {
    console.error("Usage: pnpm menu:parse -- --upload=<menuUploadId>");
    return 2;
  }
  const { dishPages, ...result } = await parseMenuUpload(id, { trigger: "cli" });
  console.log(JSON.stringify({ ...result, dishRowsChanged: dishPages.length }, null, 2));
  return result.status === "FAILED" ? 1 : 0;
}

main()
  .then((code) => (process.exitCode = code))
  .catch((error: unknown) => {
    console.error(
      error instanceof AppError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : error,
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
