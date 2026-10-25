"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createRestaurantAction } from "@/server/actions/admin-restaurants";
import { describeActionError } from "./action-error";
import { RestaurantCreateFields, type CreateFieldsValues } from "./RestaurantCreateFields";

/** /admin/restaurants/new: a restaurant Overture misses, typed by hand (source MANUAL). */
export function AddRestaurantForm({
  cities,
  launchDishes,
}: {
  cities: { id: string; name: string; areas: { id: string; name: string }[] }[];
  launchDishes: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create(values: CreateFieldsValues) {
    startTransition(async () => {
      let res;
      try {
        res = await createRestaurantAction(values);
      } catch {
        setError("The request did not reach the server. Check the connection and try again.");
        return;
      }
      if (res.error) {
        setError(describeActionError(res.error));
        return;
      }
      router.push(`/admin/restaurants/${res.data.restaurant.id}`);
    });
  }

  return (
    <RestaurantCreateFields
      idPrefix="add"
      cities={cities}
      defaultAreaId=""
      dishes={launchDishes}
      defaultDishSlugs={[]}
      withLocation
      note="For a place that is not in the Overture list. Type the name as on the signboard and a short address; the location is optional (you can add it later)."
      submitLabel="Add restaurant"
      pending={pending}
      error={error}
      onSubmit={create}
    />
  );
}
