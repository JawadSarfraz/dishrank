// The Overture credit on /about/data (docs/07 §1; docs/research/overture-coverage.md §7). CDLA
// Permissive 2.0 asks that the licence text is available with shared data: the page links it
// (CDLA_PERMISSIVE_2_URL in src/components/layout/OvertureCredit.tsx).
import { logEvent } from "@/server/log";
import { latestOvertureSync } from "./overture-sync.service";

export type OvertureCredit = { release: string; accessedOn: string };

/** The release and access date of the research report, until a sync is recorded. */
export const DEFAULT_OVERTURE_CREDIT: OvertureCredit = {
  release: "2026-10-21.0",
  accessedOn: "2026-10-25",
};

/** The newest synced release, accessed on the day it was first synced. Never fails the page. */
export async function getOvertureCredit(): Promise<OvertureCredit> {
  try {
    const latest = await latestOvertureSync();
    return latest
      ? { release: latest.release, accessedOn: latest.firstSyncedOn }
      : DEFAULT_OVERTURE_CREDIT;
  } catch (error) {
    logEvent(
      "data_credit.error",
      { error: error instanceof Error ? error.message : String(error) },
      "warn",
    );
    return DEFAULT_OVERTURE_CREDIT;
  }
}
