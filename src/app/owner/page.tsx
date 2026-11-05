import Link from "next/link";
import { Forbidden } from "@/components/auth/Forbidden";
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
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Your restaurants</h1>
      {restaurants.length === 0 ? (
        <p>
          You do not manage a restaurant yet. On your restaurant&apos;s page, open &quot;Is this
          your restaurant?&quot; to claim it.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {restaurants.map((r) => (
            <li key={r.id}>
              <Link
                href={`/owner/restaurants/${r.id}`}
                className="flex min-h-11 flex-col justify-center px-3 py-2 hover:bg-muted/50"
              >
                <span className="font-medium underline">{r.name}</span>
                <span className="text-sm text-muted-foreground">
                  {r.area?.name ?? "no area"}, {r.city.name} · {r._count.dishes} dishes
                  {r.status !== "ACTIVE" ? ` · ${r.status.toLowerCase()}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">
        You see scores, votes and ranks of your dishes, never who rated them. You cannot rate your
        own restaurant.
      </p>
    </main>
  );
}
