// On-demand revalidation after rating writes (docs/02 Caching). The ranking page arrives in Phase 4;
// its path is revalidated by string now, so nothing changes when it lands.
import { revalidatePath } from "next/cache";

/** The ISR pages that show one dish row's score: its ranking page and its restaurant page. */
export function revalidateDishPages(p: {
  citySlug: string;
  dishSlug: string;
  restaurantSlug: string;
}) {
  revalidatePath(`/${p.citySlug}/best-${p.dishSlug}`);
  revalidatePath(`/${p.citySlug}/r/${p.restaurantSlug}`);
}
