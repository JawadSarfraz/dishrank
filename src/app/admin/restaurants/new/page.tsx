import Link from "next/link";
import { AddRestaurantForm } from "@/components/admin/AddRestaurantForm";
import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";
import { getRestaurantFormOptions } from "@/server/services/import.service";

export default async function AddRestaurantPage() {
  const user = await requirePageRole("ADMIN", "/admin/restaurants/new");
  if (!user) return <Forbidden />;

  const { cities, launchDishes } = await getRestaurantFormOptions(user);
  return (
    <main className="flex flex-col gap-4">
      <Link href="/admin/restaurants" className="text-sm underline">
        ← Restaurants
      </Link>
      <h1 className="text-2xl font-bold">Add restaurant</h1>
      <AddRestaurantForm cities={cities} launchDishes={launchDishes} />
    </main>
  );
}
