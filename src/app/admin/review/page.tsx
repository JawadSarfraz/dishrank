import Link from "next/link";
import { ReviewItemCard } from "@/components/admin/ReviewItemCard";
import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";
import { getRestaurantFormOptions } from "@/server/services/import.service";
import { getReviewQueue, PHASE3_REVIEW_TYPES } from "@/server/services/review.service";
import { reviewQueueQuery } from "@/server/validation";

const LABELS: Record<(typeof PHASE3_REVIEW_TYPES)[number], string> = {
  SUSPICIOUS_RATINGS: "Held ratings",
  DISH_PROPOSAL: "Dish suggestions",
  RESTAURANT_PROPOSAL: "Restaurant suggestions",
  LOCATION_SUGGESTION: "Locations",
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

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Review queue</h1>
      <p className="text-sm">
        Held ratings do not count until approved. Suggestions are never public until you create
        them. Menu items, flags and claims arrive in Phases 5 and 6.
      </p>
      <nav aria-label="Item types" className="flex flex-wrap gap-3 text-sm">
        <Link href={tab()} className={query.type ? "underline" : "font-semibold"}>
          All open ({Object.values(queue.counts).reduce((a, b) => a + (b ?? 0), 0)})
        </Link>
        {PHASE3_REVIEW_TYPES.map((type) => (
          <Link
            key={type}
            href={tab(type)}
            className={query.type === type ? "font-semibold" : "underline"}
          >
            {LABELS[type]} ({queue.counts[type] ?? 0})
          </Link>
        ))}
      </nav>
      <nav aria-label="Status" className="flex gap-3 text-sm">
        {(["OPEN", "RESOLVED", "REJECTED"] as const).map((s) => (
          <Link
            key={s}
            href={`/admin/review?${new URLSearchParams({ ...(query.type ? { type: query.type } : {}), status: s })}`}
            className={query.status === s ? "font-semibold" : "underline"}
          >
            {s.toLowerCase()}
          </Link>
        ))}
      </nav>
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
        {queue.items.length === 0 && <li className="text-sm">Nothing here.</li>}
      </ul>
      {queue.nextCursor && (
        <Link
          href={`/admin/review?${new URLSearchParams({
            ...(query.type ? { type: query.type } : {}),
            status: query.status,
            cursor: queue.nextCursor,
          })}`}
          className="text-sm underline"
        >
          More
        </Link>
      )}
    </main>
  );
}
