// pnpm rankings:recompute: the same nightly recompute as /api/cron/recompute-rankings (docs/04
// recomputeAll), writing a JobRun. Run outside Next.js, it cannot revalidate pages: they pick up
// the new ranks at their hourly ISR refresh.
import "dotenv/config";
import { db } from "@/server/db";
import { recomputeAll } from "@/server/services/ranking-nightly.service";

async function main(): Promise<number> {
  const { ok, jobRunId, summary } = await recomputeAll({ trigger: "cli" });
  console.log(JSON.stringify({ ok, jobRunId, summary }, null, 2));
  return ok ? 0 : 1;
}

main()
  .then((code) => (process.exitCode = code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
