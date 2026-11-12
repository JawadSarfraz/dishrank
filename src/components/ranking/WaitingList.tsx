// "Still need votes" while nothing ranks yet (docs/04, spec §4 Contender row): the places that have
// raters but no rank, most raters first, as an invitation to rate. Server component; each row says
// how far it is from a rank and has a Rate pill into the rate flow at the score step. On a ranked
// page these rows lead the combined "Still need votes" list instead (Contenders, variant "ranked").
import { ListHeader, PlaceRow, rateHrefOf, stillNeeds } from "@/components/dish/PlaceRow";
import { RowList } from "@/components/ui/kit";

export type WaitingRow = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  votes: number;
  /** Nothing is missing: the next re-rank gives it its place. */
  ranksNext: boolean;
};

export function WaitingList({
  rows,
  citySlug,
  dishSlug,
  dishName,
  minRaters,
  leadIn,
}: {
  rows: WaitingRow[];
  citySlug: string;
  dishSlug: string;
  dishName: string;
  minRaters: number;
  /** True when nothing ranks yet: this list is the page's main content. */
  leadIn: boolean;
}) {
  return (
    <section aria-labelledby="not-enough" className="flex flex-col gap-3">
      <ListHeader
        id="not-enough"
        title="Still need votes"
        count={`${rows.length} place${rows.length === 1 ? "" : "s"}`}
        note={
          leadIn
            ? `Your rating can put the first ${dishName} on the list.`
            : `A place joins the ranking after ${minRaters} diners rate it.`
        }
      />
      <RowList>
        {rows.map((row) => (
          <PlaceRow
            key={row.id}
            href={`/${citySlug}/r/${row.slug}`}
            rateHref={rateHrefOf(citySlug, row.slug, dishSlug)}
            name={row.name}
            detail={[row.area, stillNeeds(row.votes, minRaters, row.ranksNext)]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
      </RowList>
    </section>
  );
}
