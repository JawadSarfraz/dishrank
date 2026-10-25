import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MergeRestaurantDialog,
  RestaurantEditForm,
  RestaurantStatusForm,
} from "@/components/admin/RestaurantForms";
import { Forbidden } from "@/components/auth/Forbidden";
import { Badge } from "@/components/ui/badge";
import { requirePageRole } from "@/server/auth";
import { getRestaurantForAdmin } from "@/server/services/restaurant.service";

export default async function AdminRestaurantPage({
  params,
}: PageProps<"/admin/restaurants/[id]">) {
  const { id } = await params;
  const user = await requirePageRole("ADMIN", `/admin/restaurants/${id}`);
  if (!user) return <Forbidden />;

  const found = await getRestaurantForAdmin(user, id);
  if (!found) notFound();
  const { restaurant: r, areas, dishes, mergedInto } = found;
  const merged = r.status === "DUPLICATE";

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/admin/restaurants" className="text-sm underline">
          ← Restaurants
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {r.name}{" "}
          <Badge variant={r.status === "ACTIVE" ? "secondary" : "outline"}>{r.status}</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          {r.area?.name ?? "no area"}, {r.city.name} · slug {r.slug}
          {r.status === "ACTIVE" && (
            <>
              {" · "}
              <Link href={`/${r.city.slug}/r/${r.slug}`} className="underline">
                public page
              </Link>
            </>
          )}
        </p>
        {merged && mergedInto && (
          <p className="text-sm">
            Merged into{" "}
            <Link href={`/admin/restaurants/${mergedInto.id}`} className="underline">
              {mergedInto.name}
            </Link>
            ; its URL redirects there.
          </p>
        )}
      </header>

      <section className="flex flex-col gap-1 text-sm" aria-label="Source and location">
        <h2 className="text-lg font-semibold">Source and location</h2>
        <p>
          {r.source === "OVERTURE"
            ? "Created from an Overture Maps place"
            : "Added by hand (not from Overture)"}
          {r.overtureId ? ` · Overture id ${r.overtureId}` : ""}
        </p>
        <p>
          {r.lat !== null && r.lng !== null ? (
            <>
              {r.lat}, {r.lng} (
              {r.locationSource === "OVERTURE" ? "from Overture" : "typed by an admin"}) ·{" "}
              <a
                href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Check on OpenStreetMap
              </a>
            </>
          ) : (
            "Location unknown: type it below to enable distance."
          )}
        </p>
      </section>

      {!merged && (
        <>
          <section className="flex flex-col gap-3" aria-label="Edit">
            <h2 className="text-lg font-semibold">Edit</h2>
            <RestaurantEditForm
              restaurant={{
                id: r.id,
                name: r.name,
                areaId: r.areaId,
                address: r.address,
                phone: r.phone,
                website: r.website,
                priceBand: r.priceBand,
                aliases: r.aliases,
                lat: r.lat,
                lng: r.lng,
              }}
              areas={areas.map((a) => ({ id: a.id, name: a.name }))}
            />
          </section>
          <section className="flex flex-col gap-3" aria-label="Status and merge">
            <h2 className="text-lg font-semibold">Status</h2>
            <RestaurantStatusForm id={r.id} status={r.status} />
            <MergeRestaurantDialog source={{ id: r.id, name: r.name }} cityId={r.cityId} />
          </section>
        </>
      )}

      <section className="flex flex-col gap-2" aria-label="Dishes">
        <h2 className="text-lg font-semibold">Dishes ({dishes.length})</h2>
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {dishes.map((d) => (
            <li key={d.id} className="flex flex-wrap justify-between gap-2 p-2">
              <span>{d.dish.name}</span>
              <span className="text-muted-foreground">
                {d.status} · {d.source} · {d.distinctRaters} raters
                {d.price !== null ? ` · Rs ${d.price}` : ""}
              </span>
            </li>
          ))}
          {dishes.length === 0 && <li className="p-2">No dishes yet.</li>}
        </ul>
      </section>
    </main>
  );
}
