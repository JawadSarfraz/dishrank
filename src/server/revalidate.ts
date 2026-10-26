// On-demand revalidation after rating writes (docs/02 Caching): a new rating shows on the public
// pages at the next visit, without waiting for the hourly ISR refresh.
import { revalidatePath } from "next/cache";

/**
 * The ISR pages that show one dish row's score: its ranking page, its restaurant page, the city's
 * dish grid and the home page (which shows the first city's grid). The ranking page's Open Graph
 * image keeps its own hourly refresh.
 */
export function revalidateDishPages(p: {
  citySlug: string;
  dishSlug: string;
  restaurantSlug: string;
}) {
  revalidatePath(`/${p.citySlug}/best-${p.dishSlug}`);
  revalidatePath(`/${p.citySlug}/r/${p.restaurantSlug}`);
  revalidatePath(`/${p.citySlug}`);
  revalidatePath("/");
}
