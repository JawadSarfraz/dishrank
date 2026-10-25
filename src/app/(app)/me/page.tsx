import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteRatingButton } from "@/components/me/DeleteRatingButton";
import { getSessionUser } from "@/server/auth";
import { listMyRatings } from "@/server/services/rating.service";
import { meRatingsQuery } from "@/server/validation";

export const metadata: Metadata = { title: "My ratings · DishRank", robots: { index: false } };

const date = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" });

const STATUS_NOTE: Record<string, string | null> = {
  ACTIVE: null,
  HELD: "Under review",
  HIDDEN: "Not counted (hidden by a moderator)",
};

export default async function MyRatingsPage({ searchParams }: PageProps<"/me">) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=%2Fme");
  const parsed = meRatingsQuery.safeParse(await searchParams);
  const { data: ratings, nextCursor } = await listMyRatings(
    user,
    parsed.success ? parsed.data : { limit: 50 },
  );

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">My ratings</h1>
        <Link href="/rate" className="min-h-11 py-2 underline">
          Rate a dish
        </Link>
      </div>
      {ratings.length === 0 ? (
        <p>
          You have not rated anything yet.{" "}
          <Link href="/rate" className="underline">
            Rate your first dish
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {ratings.map((r) => {
            const note = STATUS_NOTE[r.status];
            const edit = `/rate?city=${r.restaurant.city.slug}&r=${r.restaurant.slug}&d=${r.dish.slug}`;
            return (
              <li key={r.id} className="flex flex-col gap-2 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{r.dish.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {r.restaurant.active ? (
                        <Link
                          href={`/${r.restaurant.city.slug}/r/${r.restaurant.slug}`}
                          className="underline"
                        >
                          {r.restaurant.name}
                        </Link>
                      ) : (
                        r.restaurant.name
                      )}
                      {r.restaurant.area ? ` · ${r.restaurant.area}` : ""} ·{" "}
                      {date.format(r.updatedAt)}
                    </span>
                  </div>
                  <span
                    className="text-2xl font-semibold"
                    aria-label={`Score ${r.score} out of 10`}
                  >
                    {r.score}
                  </span>
                </div>
                {note && <p className="text-sm font-medium">{note}</p>}
                {r.comment && <p className="text-sm">“{r.comment}”</p>}
                <div className="flex gap-4">
                  {r.restaurant.active && (
                    <Link href={edit} className="min-h-11 py-2 underline">
                      Edit
                    </Link>
                  )}
                  <DeleteRatingButton
                    ratingId={r.id}
                    label={`${r.dish.name} at ${r.restaurant.name}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {nextCursor && (
        <Link href={`/me?cursor=${nextCursor}`} className="min-h-11 py-2 underline">
          Older ratings
        </Link>
      )}
    </main>
  );
}
