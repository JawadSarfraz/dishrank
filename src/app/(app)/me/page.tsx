import type { Metadata } from "next";
import { PencilIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DishIcon } from "@/components/brand/DishIcon";
import { Main, PageHeader, SectionHeader } from "@/components/layout/Page";
import { DeleteAccount } from "@/components/me/DeleteAccount";
import { DeleteRatingButton } from "@/components/me/DeleteRatingButton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/server/auth";
import { listMyClaims } from "@/server/services/claim.service";
import { listMyRatings } from "@/server/services/rating.service";
import { meRatingsQuery } from "@/server/validation";
import { ButtonLink } from "@/components/ui/button-link";

export const metadata: Metadata = { title: "My ratings", robots: { index: false } };

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
  const [{ data: ratings, nextCursor }, claims] = await Promise.all([
    listMyRatings(user, parsed.success ? parsed.data : { limit: 50 }),
    listMyClaims(user),
  ]);

  return (
    <Main className="gap-6">
      <PageHeader
        title="My ratings"
        lede={
          ratings.length > 0
            ? "Your scores count toward the rankings without your name. Change one any time."
            : undefined
        }
        actions={
          <ButtonLink href="/rate" size="sm" className="h-11 text-base">
            Rate a dish
          </ButtonLink>
        }
      />
      {ratings.length === 0 ? (
        <EmptyState
          icon={<StarIcon className="size-6" aria-hidden="true" />}
          title="You have not rated anything yet"
          text="Pick a restaurant, pick a dish, give it 1 to 10. Four taps, and it counts right away."
          action={{ href: "/rate", label: "Rate your first dish" }}
        />
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-card">
          {ratings.map((r) => {
            const note = STATUS_NOTE[r.status];
            const edit = `/rate?city=${r.restaurant.city.slug}&r=${r.restaurant.slug}&d=${r.dish.slug}`;
            return (
              <li key={r.id} className="flex flex-col gap-2 px-3 py-3 sm:px-4">
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <DishIcon slug={r.dish.slug} size={22} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-display text-lg leading-tight font-bold break-anywhere">
                      {r.dish.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {r.restaurant.active ? (
                        <Link
                          href={`/${r.restaurant.city.slug}/r/${r.restaurant.slug}`}
                          className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          {r.restaurant.name}
                        </Link>
                      ) : (
                        r.restaurant.name
                      )}
                      {r.restaurant.area ? ` · ${r.restaurant.area}` : ""} ·{" "}
                      {date.format(r.updatedAt)}
                    </span>
                    {note && <Badge variant="secondary">{note}</Badge>}
                    {r.comment && <p className="pt-1 text-sm">“{r.comment}”</p>}
                  </div>
                  <span
                    className="font-display text-4xl leading-none font-extrabold tabular-nums"
                    aria-label={`Score ${r.score} out of 10`}
                  >
                    {r.score}
                  </span>
                </div>
                <div className="flex items-center gap-4 pl-12">
                  {r.restaurant.active && (
                    <Link
                      href={edit}
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand underline-offset-4 hover:underline"
                    >
                      <PencilIcon aria-hidden="true" className="size-4" /> Edit
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
        <ButtonLink variant="outline" href={`/me?cursor=${nextCursor}`} className="w-fit">
          Older ratings
        </ButtonLink>
      )}

      {claims.length > 0 && (
        <section aria-labelledby="claims" className="flex flex-col gap-3">
          <SectionHeader id="claims" title="Restaurant claims" />
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-card">
            {claims.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                <span className="font-display text-base font-bold">{c.restaurant.name}</span>
                <span className="text-muted-foreground">
                  {c.status === "PENDING"
                    ? `Waiting for our call (sent ${date.format(c.createdAt)})`
                    : c.status === "APPROVED"
                      ? c.managing
                        ? "Approved: you manage this restaurant"
                        : "Approved earlier; you no longer manage this restaurant"
                      : `Not approved: ${c.rejectReason ?? "no reason given"}`}
                </span>
                {c.managing && (
                  <Link
                    href="/owner"
                    className="inline-flex min-h-11 w-fit items-center font-medium text-brand underline-offset-4 hover:underline"
                  >
                    Open your restaurants
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="account" className="flex flex-col gap-3">
        <SectionHeader id="account" title="Your account" />
        <p className="text-sm text-muted-foreground">
          Signed in as {user.email}. What we keep and why:{" "}
          <Link
            href="/privacy"
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            privacy
          </Link>
          .
        </p>
        <DeleteAccount isAdmin={user.role === "ADMIN"} />
      </section>
    </Main>
  );
}
