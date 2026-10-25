// POST /api/v1/restaurant-dishes (docs/06): the restaurant serves a dish from the canonical list.
import { requireUser } from "@/server/auth";
import { jsonData, jsonError, readJson } from "@/server/http";
import { addRestaurantDish } from "@/server/services/rating.service";
import { parseInput, restaurantDishInput } from "@/server/validation";

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const row = await addRestaurantDish(
      actor,
      parseInput(restaurantDishInput, await readJson(request)),
    );
    return jsonData(row, { status: row.created ? 201 : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
