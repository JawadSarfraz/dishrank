import Link from "next/link";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/auth/Forbidden";
import { OwnerDishActions } from "@/components/owner/OwnerDishRow";
import { MenuUploadButton } from "@/components/restaurant/MenuUploadButton";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatScore } from "@/lib/format";
import { AppError } from "@/server/errors";
import { requirePageRole } from "@/server/auth";
import { getOwnerRestaurant } from "@/server/services/owner.service";

const day = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" });

const STATUS_LABEL: Record<string, string> = {
  CANDIDATE: "suggested, not confirmed",
  USER_CONFIRMED: "confirmed by diners",
  MENU_VERIFIED: "seen on your menu",
  OWNER_VERIFIED: "confirmed by you",
  STALE: "no recent ratings",
};

export default async function OwnerRestaurantPage({
  params,
}: PageProps<"/owner/restaurants/[id]">) {
  const { id } = await params;
  const user = await requirePageRole(
    ["OWNER", "ADMIN"],
    `/owner/restaurants/${encodeURIComponent(id)}`,
  );
  if (!user) return <Forbidden />;

  let data;
  try {
    data = await getOwnerRestaurant(user, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const { restaurant: r, dishes, removed } = data;

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/owner" className="text-sm underline">
          ← Your restaurants
        </Link>
        <h1 className="text-2xl font-bold">{r.name}</h1>
        <p className="text-sm text-muted-foreground">
          {r.area?.name ?? "no area"}, {r.city.name}
          {r.status === "ACTIVE" ? (
            <>
              {" · "}
              <Link href={`/${r.city.slug}/r/${r.slug}`} className="underline">
                public page
              </Link>
            </>
          ) : (
            ` · ${r.status.toLowerCase()}`
          )}
        </p>
      </header>

      <section aria-labelledby="dishes" className="flex flex-col gap-2">
        <h2 id="dishes" className="text-lg font-semibold">
          Dishes ({dishes.length})
        </h2>
        <p className="text-sm text-muted-foreground">
          Confirm the dishes you serve and fix their names and prices. A rank needs enough ratings
          from different diners; you cannot rate your own restaurant.
        </p>
        <ul className="flex flex-col divide-y rounded-lg border">
          {dishes.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {d.dish.name}
                  {d.menuName && d.menuName !== d.dish.name ? (
                    <span className="font-normal text-muted-foreground"> · “{d.menuName}”</span>
                  ) : null}
                </span>
                <Badge variant={d.status === "OWNER_VERIFIED" ? "default" : "outline"}>
                  {STATUS_LABEL[d.status] ?? d.status.toLowerCase()}
                </Badge>
              </div>
              <p className="text-sm">
                {d.rankInCity !== null ? `#${d.rankInCity} in ${r.city.name}` : "Not ranked yet"}
                {d.score !== null && d.rankInCity !== null
                  ? ` · score ${formatScore(d.score)}`
                  : ""}
                {` · ${d.distinctRaters} vote${d.distinctRaters === 1 ? "" : "s"}`}
                {d.price !== null ? ` · ${formatPrice(d.price)}` : " · no price"}
              </p>
              {d.history.length > 0 && (
                <details className="text-sm">
                  <summary className="min-h-11 cursor-pointer py-2.5">Rank by week</summary>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b text-left">
                        <th scope="col" className="py-1 pr-2 font-semibold">
                          Week
                        </th>
                        <th scope="col" className="py-1 pr-2 text-right font-semibold">
                          Rank
                        </th>
                        <th scope="col" className="py-1 pr-2 text-right font-semibold">
                          Score
                        </th>
                        <th scope="col" className="py-1 text-right font-semibold">
                          Votes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.history.map((h) => (
                        <tr key={h.at.toISOString()} className="border-b">
                          <td className="py-1 pr-2">{day.format(h.at)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">
                            {h.rank === null ? "not ranked" : `#${h.rank}`}
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">
                            {h.score === null ? "–" : formatScore(h.score)}
                          </td>
                          <td className="py-1 text-right tabular-nums">{h.votes ?? "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
              <OwnerDishActions
                rowId={d.id}
                dishName={d.dish.name}
                status={d.status}
                menuName={d.menuName}
                price={d.price}
              />
            </li>
          ))}
          {dishes.length === 0 && (
            <li className="p-3 text-sm">
              No dishes listed yet. Upload a photo of your menu and our team adds them.
            </li>
          )}
        </ul>
      </section>

      {r.status === "ACTIVE" && <MenuUploadButton restaurantId={r.id} />}

      {removed.length > 0 && (
        <section aria-labelledby="removed" className="flex flex-col gap-2">
          <h2 id="removed" className="text-lg font-semibold">
            Removed
          </h2>
          <p className="text-sm text-muted-foreground">
            Not shown anywhere. To bring one back, tell us on the dispute page.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {removed.map((d) => (
              <li key={d.id}>{d.dish.name}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
