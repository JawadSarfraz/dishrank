import { ChevronRightIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { Forbidden } from "@/components/auth/Forbidden";
import { PageHeader } from "@/components/layout/Page";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageRole } from "@/server/auth";
import { AppError } from "@/server/errors";
import { listMyRestaurants } from "@/server/services/owner.service";

export default async function OwnerHomePage() {
  const user = await requirePageRole(["OWNER", "ADMIN"], "/owner");
  if (!user) return <Forbidden />;

  let restaurants;
  try {
    restaurants = await listMyRestaurants(user);
  } catch (error) {
    // A banned owner keeps the role until an admin removes it, but not the area.
    if (error instanceof AppError && error.code === "USER_BANNED") return <Forbidden />;
    throw error;
  }
  return (
    <main className="flex flex-col gap-5">
      <PageHeader
        title="Your restaurants"
        lede="You see scores, votes and ranks of your dishes, never who rated them. You cannot rate your own restaurant."
      />
      {restaurants.length === 0 ? (
        <EmptyState
          icon={<StoreIcon className="size-6" aria-hidden="true" />}
          title="You do not manage a restaurant yet"
          text="On your restaurant's public page, open “Is this your restaurant?” and send a claim. We call to check it."
          action={{ href: "/", label: "Find your restaurant" }}
        />
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-card">
          {restaurants.map((r) => (
            <li key={r.id}>
              <Link
                href={`/owner/restaurants/${r.id}`}
                className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-display text-lg leading-tight font-bold break-anywhere">
                    {r.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {r.area?.name ?? "no area"}, {r.city.name} · {r._count.dishes} dishes
                    {r.status !== "ACTIVE" && (
                      <Badge variant="outline">{r.status.toLowerCase()}</Badge>
                    )}
                  </span>
                </span>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
