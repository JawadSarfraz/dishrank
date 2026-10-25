import type { OvertureCredit as Credit } from "@/server/services/data-credits";

/** The licence text of CDLA Permissive 2.0 (Meta and Microsoft records). */
export const CDLA_PERMISSIVE_2_URL = "https://cdla.dev/permissive-2-0/";

/** Overture's credit lines, word for word (docs.overturemaps.org/attribution). */
export function OvertureCredit({ release, accessedOn }: Credit) {
  const licence = (
    <a href={CDLA_PERMISSIVE_2_URL} className="underline" rel="license">
      CDLA Permissive 2.0
    </a>
  );
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
      <li>
        Overture Maps Foundation,{" "}
        <a href="https://overturemaps.org" className="underline">
          overturemaps.org
        </a>{" "}
        (release {release}, accessed {accessedOn}).
      </li>
      <li>Data from Meta. Available under {licence}.</li>
      <li>Data from Microsoft. Available under {licence}.</li>
    </ul>
  );
}
