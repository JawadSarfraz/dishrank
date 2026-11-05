import { AdminHeader, AdminTabs } from "@/components/admin/AdminPage";
import { ReviewItemCard } from "@/components/admin/ReviewItemCard";
import { Forbidden } from "@/components/auth/Forbidden";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageRole } from "@/server/auth";
import { getRestaurantFormOptions } from "@/server/services/import.service";
import { getReviewQueue, REVIEW_PAGE_TYPES } from "@/server/services/review.service";
import { reviewQueueQuery } from "@/server/validation";

const LABELS: Record<(typeof REVIEW_PAGE_TYPES)[number], string> = {
  OWNER_CLAIM: "Owner claims",
  UNMATCHED_MENU_ITEM: "Menu items",
  SUSPICIOUS_RATINGS: "Held ratings",
  DISH_PROPOSAL: "Dish suggestions",
  RESTAURANT_PROPOSAL: "Restaurant suggestions",
  LOCATION_SUGGESTION: "Locations",
  FLAG: "Reports and disputes",
};

export default async function AdminReviewPage({ searchParams }: PageProps<"/admin/review">) {
  const user = await requirePageRole("ADMIN", "/admin/review");
  if (!user) return <Forbidden />;

  const parsed = reviewQueueQuery.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { status: "OPEN" as const, limit: 50 };
  const [queue, options] = await Promise.all([
    getReviewQueue(user, query),
    getRestaurantFormOptions(user),
  ]);
  const tab = (type?: string) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (query.status !== "OPEN") params.set("status", query.status);
    const qs = params.toString();
    return qs ? `/admin/review?${qs}` : "/admin/review";
  };
  const openCount = Object.values(queue.counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <main className="flex flex-col gap-5">
      <AdminHeader
        title="Review queue"
        help="Held ratings do not count until approved. Suggestions are never public until you create them. Reports and disputes change nothing by themselves: act on Restaurants, then mark them done. Assigning a dish to a menu item marks the dish as on the restaurant's menu. An owner claim is approved only after you checked it by phone."
      />
      <AdminTabs
        label="Item types"
        items={[
          { href: tab(), label: `All open (${openCount})`, active: !query.type },
          ...REVIEW_PAGE_TYPES.map((type) => ({
            href: tab(type),
            label: `${LABELS[type]} (${queue.counts[type] ?? 0})`,
            active: query.type === type,
          })),
        ]}
      />
      <AdminTabs
        label="Status"
        items={(["OPEN", "RESOLVED", "REJECTED"] as const).map((s) => ({
          href: `/admin/review?${new URLSearchParams({ ...(query.type ? { type: query.type } : {}), status: s })}`,
          label: s.toLowerCase(),
          active: query.status === s,
        }))}
      />
      {queue.items.length === 0 ? (
        <EmptyState
          title="Nothing here"
          text={
            query.status === "OPEN"
              ? "No open items of this kind. Diners' reports, suggestions and held ratings appear here."
              : "No decided items of this kind yet."
          }
          size="compact"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {queue.items.map((item) => (
            <li key={item.id}>
              <ReviewItemCard
                item={item}
                categories={queue.categories}
                dishes={queue.dishes}
                formCities={options.cities}
                launchDishes={options.launchDishes}
              />
            </li>
          ))}
        </ul>
      )}
      {queue.nextCursor && (
        <ButtonLink
          variant="outline"
          className="w-fit"
          href={`/admin/review?${new URLSearchParams({
            ...(query.type ? { type: query.type } : {}),
            status: query.status,
            cursor: queue.nextCursor,
          })}`}
        >
          More
        </ButtonLink>
      )}
    </main>
  );
}
