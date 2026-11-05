import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, AdminList } from "@/components/admin/AdminPage";
import {
  MergeRestaurantDialog,
  RestaurantEditForm,
  RestaurantStatusForm,
} from "@/components/admin/RestaurantForms";
import { Forbidden } from "@/components/auth/Forbidden";
import { Badge } from "@/components/ui/badge";
import { requirePageRole } from "@/server/auth";
import { getRestaurantForAdmin } from "@/server/services/restaurant.service";

const section = "flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card";

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
    <main className="flex flex-col gap-5">
      <Link
        href="/admin/restaurants"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-brand underline-offset-4 hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" /> Restaurants
      </Link>
      <AdminHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {r.name}
            <Badge variant={r.status === "ACTIVE" ? "default" : "outline"}>{r.status}</Badge>
          </span>
        }
        help={
          <>
            {r.area?.name ?? "no area"}, {r.city.name} · slug {r.slug}
            {r.status === "ACTIVE" && (
              <>
                {" · "}
                <Link
                  href={`/${r.city.slug}/r/${r.slug}`}
                  className="font-medium text-brand underline-offset-4 hover:underline"
                >
                  public page
                </Link>
              </>
            )}
            {merged && mergedInto && (
              <>
                {" · merged into "}
                <Link
                  href={`/admin/restaurants/${mergedInto.id}`}
                  className="font-medium text-brand underline-offset-4 hover:underline"
                >
                  {mergedInto.name}
                </Link>
                ; its URL redirects there.
              </>
            )}
          </>
        }
      />

      <section className={`${section} text-sm`} aria-label="Source and location">
        <h2 className="text-lg font-bold">Source and location</h2>
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
                className="font-medium text-brand underline-offset-4 hover:underline"
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
          <section className={section} aria-label="Edit">
            <h2 className="text-lg font-bold">Edit</h2>
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
          <section className={section} aria-label="Status and merge">
            <h2 className="text-lg font-bold">Status</h2>
            <RestaurantStatusForm id={r.id} status={r.status} />
            <MergeRestaurantDialog source={{ id: r.id, name: r.name }} cityId={r.cityId} />
          </section>
        </>
      )}

      <section className="flex flex-col gap-3" aria-label="Dishes">
        <h2 className="text-lg font-bold">Dishes ({dishes.length})</h2>
        <AdminList>
          {dishes.map((d) => (
            <li key={d.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
              <span className="font-medium">{d.dish.name}</span>
              <span className="text-muted-foreground">
                {d.status} · {d.source} · {d.distinctRaters} raters
                {d.price !== null ? ` · Rs ${d.price}` : ""}
              </span>
            </li>
          ))}
          {dishes.length === 0 && (
            <li className="px-4 py-3 text-muted-foreground">No dishes yet.</li>
          )}
        </AdminList>
      </section>
    </main>
  );
}
