import type { Metadata } from "next";
import { PencilIcon, StarIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DishMedia } from "@/components/dish/DishMedia";
import { Main, PageHeader, SectionHeader } from "@/components/layout/Page";
import { DeleteAccount } from "@/components/me/DeleteAccount";
import { DeleteRatingButton } from "@/components/me/DeleteRatingButton";
import { SignOutButton } from "@/components/me/SignOutButton";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineLink, RowList } from "@/components/ui/kit";
import { getSessionUser } from "@/server/auth";
import { listMyClaims } from "@/server/services/claim.service";
import { listMyRatings } from "@/server/services/rating.service";
import { meRatingsQuery } from "@/server/validation";

export const metadata: Metadata = { title: "My ratings", robots: { index: false } };

const date = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" });

const STATUS_NOTE: Record<string, { text: string; tone: "default" | "secondary" } | null> = {
  ACTIVE: null,
  HELD: { text: "Under review", tone: "default" },
  HIDDEN: { text: "Not counted (hidden by a moderator)", tone: "secondary" },
};

/** A text link in a row: ink, bold, underlined, 44 px tall (spec §4, Text link). */
const rowLink =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-ink underline underline-offset-4 hover:text-brand-press";

export default async function MyRatingsPage({ searchParams }: PageProps<"/me">) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=%2Fme");
  const parsed = meRatingsQuery.safeParse(await searchParams);
  const [{ data: ratings, nextCursor }, claims] = await Promise.all([
    listMyRatings(user, parsed.success ? parsed.data : { limit: 50 }),
    listMyClaims(user),
  ]);

  return (
    <Main width="narrow">
      <PageHeader
        title="My ratings"
        lede={
          ratings.length > 0
            ? "Your scores count toward the rankings without your name. Change one any time."
            : undefined
        }
        actions={
          <ButtonLink href="/rate" variant="pill" size="pill">
            <StarIcon aria-hidden="true" className="size-4 fill-current" />
            Rate a dish
          </ButtonLink>
        }
      />
      {ratings.length === 0 ? (
        <EmptyState
          icon={<StarIcon className="size-6" aria-hidden="true" />}
          title="You have not rated anything yet"
          text="Pick a restaurant, pick a dish, give it 1 to 10. It takes four taps."
          action={{ href: "/rate", label: "Rate your first dish" }}
        />
      ) : (
        <RowList>
          {ratings.map((r) => {
            const note = STATUS_NOTE[r.status];
            const edit = `/rate?city=${r.restaurant.city.slug}&r=${r.restaurant.slug}&d=${r.dish.slug}`;
            return (
              <li key={r.id} className="flex items-start gap-3 py-3 pr-3 pl-3 sm:pl-4">
                <DishMedia
                  slug={r.dish.slug}
                  slot="row"
                  allowPhoto={false}
                  className="mt-0.5 size-14 shrink-0 rounded-[14px]"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-base leading-[22px] font-bold break-anywhere">
                    {r.dish.name}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground break-anywhere">
                    {r.restaurant.active ? (
                      <Link
                        href={`/${r.restaurant.city.slug}/r/${r.restaurant.slug}`}
                        className="font-semibold text-ink underline underline-offset-2 hover:text-brand-press"
                      >
                        {r.restaurant.name}
                      </Link>
                    ) : (
                      r.restaurant.name
                    )}
                    {r.restaurant.area ? ` · ${r.restaurant.area}` : ""} ·{" "}
                    {date.format(r.updatedAt)}
                  </span>
                  {note && (
                    <Badge variant={note.tone} dot={note.tone === "default"} className="mt-1">
                      {note.text}
                    </Badge>
                  )}
                  {r.comment && (
                    <p className="pt-1 text-sm leading-5 break-anywhere">“{r.comment}”</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-5">
                    {r.restaurant.active && (
                      <Link href={edit} className={rowLink}>
                        <PencilIcon aria-hidden="true" className="size-4" /> Edit
                      </Link>
                    )}
                    <DeleteRatingButton
                      ratingId={r.id}
                      label={`${r.dish.name} at ${r.restaurant.name}`}
                    />
                  </div>
                </div>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-brand font-display text-xl leading-none font-extrabold text-white tabular-nums">
                  <span className="sr-only">Your score: </span>
                  {r.score}
                  <span className="sr-only"> out of 10</span>
                </span>
              </li>
            );
          })}
        </RowList>
      )}
      {nextCursor && (
        <ButtonLink variant="outline" href={`/me?cursor=${nextCursor}`} className="sm:w-fit">
          Older ratings
        </ButtonLink>
      )}

      {claims.length > 0 && (
        <section aria-labelledby="claims" className="flex flex-col gap-3">
          <SectionHeader id="claims" title="Restaurant claims" />
          <RowList>
            {claims.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-control bg-blush text-brand-dark"
                >
                  <StoreIcon className="size-5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-base leading-[22px] font-bold break-anywhere">
                    {c.restaurant.name}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {c.status === "PENDING"
                      ? `Waiting for our call (sent ${date.format(c.createdAt)})`
                      : c.status === "APPROVED"
                        ? c.managing
                          ? "Approved: you manage this restaurant"
                          : "Approved earlier; you no longer manage this restaurant"
                        : `Not approved: ${c.rejectReason ?? "no reason given"}`}
                  </span>
                  {c.managing && (
                    <Link href="/owner" className={`${rowLink} w-fit`}>
                      Open your restaurants
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </RowList>
        </section>
      )}

      <section aria-labelledby="account" className="flex flex-col gap-3">
        <SectionHeader id="account" title="Your account" />
        <div className="flex flex-col gap-4 rounded-card border bg-card p-4 shadow-card">
          <p className="text-sm leading-5 text-muted-foreground break-anywhere">
            Signed in as <span className="font-semibold text-ink">{user.email}</span>. What we keep
            and why: <InlineLink href="/privacy">privacy</InlineLink>.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {user.role === "OWNER" && (
              <ButtonLink href="/owner" variant="outline">
                Owner area
              </ButtonLink>
            )}
            {user.role === "ADMIN" && (
              <ButtonLink href="/admin" variant="outline">
                Admin
              </ButtonLink>
            )}
            <SignOutButton />
          </div>
        </div>
        <DeleteAccount isAdmin={user.role === "ADMIN"} />
      </section>
    </Main>
  );
}
