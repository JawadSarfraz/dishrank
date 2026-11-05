import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/auth/Forbidden";
import { DishIcon } from "@/components/brand/DishIcon";
import { PageHeader, SectionHeader } from "@/components/layout/Page";
import { OwnerDishActions } from "@/components/owner/OwnerDishRow";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";
import { MenuUploadButton } from "@/components/restaurant/MenuUploadButton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatFromPrice, formatScore, formatVotes } from "@/lib/format";
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
    if (error instanceof AppError && error.code === "USER_BANNED") return <Forbidden />;
    throw error;
  }
  const { restaurant: r, dishes, removed } = data;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/owner"
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" /> Your restaurants
        </Link>
        <PageHeader
          title={r.name}
          lede={
            <>
              {r.area?.name ?? "no area"}, {r.city.name}
              {r.status === "ACTIVE" ? (
                <>
                  {" · "}
                  <Link
                    href={`/${r.city.slug}/r/${r.slug}`}
                    className="font-medium text-brand underline-offset-4 hover:underline"
                  >
                    public page
                  </Link>
                </>
              ) : (
                ` · ${r.status.toLowerCase()}`
              )}
            </>
          }
        />
      </div>

      <section aria-labelledby="dishes" className="flex flex-col gap-3">
        <SectionHeader id="dishes" title={`Dishes (${dishes.length})`} />
        <p className="text-sm text-muted-foreground">
          Confirm the dishes you serve and fix their names and prices. A rank needs enough ratings
          from different diners; you cannot rate your own restaurant.
        </p>
        {dishes.length === 0 ? (
          <EmptyState
            icon={<DishIcon name="plate" size={26} />}
            title="No dishes listed yet"
            text="Upload a photo of your menu below and our team adds its dishes."
            size="compact"
          />
        ) : (
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-card">
            {dishes.map((d) => (
              <li key={d.id} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <DishIcon slug={d.dish.slug} size={22} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-display text-lg leading-tight font-bold break-anywhere">
                      {d.dish.name}
                      {d.menuName && d.menuName !== d.dish.name ? (
                        <span className="font-sans text-base font-normal text-muted-foreground">
                          {" "}
                          · “{d.menuName}”
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant={d.status === "OWNER_VERIFIED" ? "default" : "outline"}>
                        {STATUS_LABEL[d.status] ?? d.status.toLowerCase()}
                      </Badge>
                      <span>
                        {d.rankInCity !== null
                          ? `#${d.rankInCity} in ${r.city.name}`
                          : "Not ranked yet"}
                        {d.price !== null ? ` · ${formatFromPrice(d.price)}` : " · no price"}
                      </span>
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    {d.score !== null && d.rankInCity !== null ? (
                      <ScoreBadge score={d.score} votes={d.distinctRaters} layout="stack" />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {formatVotes(d.distinctRaters)}
                      </span>
                    )}
                  </div>
                </div>
                {d.history.length > 0 && (
                  <details className="group/history rounded-lg bg-muted/60 px-3 text-sm">
                    <summary className="min-h-11 cursor-pointer list-none py-2.5 font-medium select-none [&::-webkit-details-marker]:hidden">
                      Rank by week
                    </summary>
                    <table className="mb-3 w-full border-collapse">
                      <thead>
                        <tr className="border-b text-left">
                          <th scope="col" className="py-1 pr-2 font-medium">
                            Week
                          </th>
                          <th scope="col" className="py-1 pr-2 text-right font-medium">
                            Rank
                          </th>
                          <th scope="col" className="py-1 pr-2 text-right font-medium">
                            Score
                          </th>
                          <th scope="col" className="py-1 text-right font-medium">
                            Votes
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.history.map((h) => (
                          <tr key={h.at.toISOString()} className="border-b last:border-0">
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
          </ul>
        )}
      </section>

      {r.status === "ACTIVE" && <MenuUploadButton restaurantId={r.id} />}

      {removed.length > 0 && (
        <section aria-labelledby="removed" className="flex flex-col gap-2">
          <SectionHeader id="removed" title="Removed" />
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
