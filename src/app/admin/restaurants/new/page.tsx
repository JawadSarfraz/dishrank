import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { AddRestaurantForm } from "@/components/admin/AddRestaurantForm";
import { AdminHeader } from "@/components/admin/AdminPage";
import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";
import { getRestaurantFormOptions } from "@/server/services/import.service";

export default async function AddRestaurantPage() {
  const user = await requirePageRole("ADMIN", "/admin/restaurants/new");
  if (!user) return <Forbidden />;

  const { cities, launchDishes } = await getRestaurantFormOptions(user);
  return (
    <main className="flex flex-col gap-5">
      <Link
        href="/admin/restaurants"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-brand underline-offset-4 hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" /> Restaurants
      </Link>
      <AdminHeader
        title="Add restaurant"
        help="By hand, for a place Overture does not have. Use the signboard spelling; the slug is made from the name and never changes."
      />
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <AddRestaurantForm cities={cities} launchDishes={launchDishes} />
      </div>
    </main>
  );
}
