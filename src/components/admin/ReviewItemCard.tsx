"use client";

// One review item with its decisions (docs/07 §6, Phase 3 types). Approve and reject for every
// type; dish suggestions are approved by creating the dish or mapping to one, restaurant
// suggestions by creating the restaurant (typed form) or linking to one.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/slug";
import { resolveReviewItemAction } from "@/server/actions/admin-review";
import type { ReviewQueue } from "@/server/services/review.service";
import { describeActionError } from "./action-error";
import { RestaurantCreateFields } from "./RestaurantCreateFields";
import { RestaurantPicker } from "./RestaurantPicker";

type Item = ReviewQueue["items"][number];
type Cities = { id: string; name: string; areas: { id: string; name: string }[] }[];

const date = new Intl.DateTimeFormat("en-PK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Karachi",
});
const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";
const REPORT_LABELS: Record<string, string> = {
  CLOSED: "closed",
  WRONG_LOCATION: "wrong location",
  WRONG_DISH: "wrong dish",
  OTHER: "other",
};
const osm = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;

export function ReviewItemCard({
  item,
  categories,
  dishes,
  formCities,
  launchDishes,
}: {
  item: Item;
  categories: { id: string; name: string }[];
  dishes: { id: string; slug: string; name: string; isLaunch: boolean }[];
  formCities: Cities;
  launchDishes: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "create" | "map" | "link">("idle");
  const open = item.status === "OPEN" && !message?.text.startsWith("Done");
  const p = item.payload as Record<string, unknown>;

  function resolve(input: Record<string, unknown>) {
    startTransition(async () => {
      let res;
      try {
        // The fingerprint says what this card shows; if the item changed since, nothing happens.
        res = await resolveReviewItemAction(item.id, input, item.fingerprint);
      } catch {
        setMessage({ text: "The decision did not reach the server. Try again.", error: true });
        return;
      }
      setMessage(
        res.error
          ? { text: describeActionError(res.error), error: true }
          : { text: `Done: ${res.data.resolution}.`, error: false },
      );
      // Show the item as it is now (ITEM_CHANGED: new ratings, an edited comment, a better location).
      if (res.error?.code === "ITEM_CHANGED") router.refresh();
    });
  }

  return (
    <article className="flex flex-col gap-3 rounded-lg border p-3 text-sm">
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{item.type.replace(/_/g, " ").toLowerCase()}</Badge>
        {item.type === "SUSPICIOUS_RATINGS" && (
          <Badge variant={p.reason === "BURST" ? "destructive" : "secondary"}>
            {p.reason === "BURST"
              ? "burst of new accounts"
              : `comment: ${((p.flags as string[]) ?? []).join(", ").toLowerCase() || "flagged"}`}
          </Badge>
        )}
        <span className="text-muted-foreground">{date.format(new Date(item.createdAt))}</span>
        {item.createdBy && <span className="text-muted-foreground">by {item.createdBy.email}</span>}
      </header>

      {item.restaurant && (
        <p>
          <a
            href={`/admin/restaurants/${item.restaurant.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline"
          >
            {item.restaurant.name}
          </a>
          <span className="text-muted-foreground">
            {" "}
            · {item.restaurant.area?.name ?? "no area"}, {item.restaurant.city.name}
            {item.dish && item.type === "SUSPICIOUS_RATINGS" ? ` · ${item.dish.name}` : ""}
          </span>
        </p>
      )}

      {item.type === "SUSPICIOUS_RATINGS" && (
        <ul className="flex flex-col divide-y rounded-md border">
          {item.ratings.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 p-2">
              <span>
                <span className="font-semibold">{r.score}/10</span> · {r.user.email}
                <span className="text-muted-foreground">
                  {" "}
                  · account {r.accountDays} days old{r.user.isPanel ? " · panel" : ""} ·{" "}
                  {r.status.toLowerCase()}
                </span>
              </span>
              {r.comment && <span>“{r.comment}”</span>}
            </li>
          ))}
          {item.ratings.length === 0 && (
            <li className="p-2">The ratings were deleted or merged away.</li>
          )}
        </ul>
      )}

      {item.type === "DISH_PROPOSAL" && (
        <p>
          Suggested dish: <span className="font-medium">{String(p.name)}</span>
          {p.note ? <span className="text-muted-foreground"> · “{String(p.note)}”</span> : null}
        </p>
      )}

      {item.type === "RESTAURANT_PROPOSAL" && (
        <p>
          Suggested restaurant: <span className="font-medium">{String(p.name)}</span>
          <span className="text-muted-foreground">
            {" "}
            · {item.areaName ?? "unknown area"}
            {p.note ? ` · “${String(p.note)}”` : ""}
          </span>
        </p>
      )}

      {item.type === "LOCATION_SUGGESTION" && (
        <LocationDetails payload={p} restaurant={item.restaurant} />
      )}

      {item.type === "FLAG" && p.kind === "report" && (
        <p>
          Problem:{" "}
          <span className="font-medium">{REPORT_LABELS[String(p.reason)] ?? String(p.reason)}</span>
          {item.dish ? ` · ${item.dish.name}` : ""}
          {p.note ? <span className="text-muted-foreground"> · “{String(p.note)}”</span> : null}
        </p>
      )}
      {item.type === "FLAG" && p.kind === "dispute" && (
        <div className="flex flex-col gap-1">
          <p className="whitespace-pre-wrap">“{String(p.message)}”</p>
          <p className="text-muted-foreground">
            {p.contact ? `Contact: ${String(p.contact)}` : "No contact given"}
            {p.page ? ` · About: ${String(p.page)}` : ""}
          </p>
        </div>
      )}

      {item.status !== "OPEN" && (
        <p className="text-muted-foreground">
          {item.status.toLowerCase()}: {item.resolution}{" "}
          {item.resolvedBy ? `by ${item.resolvedBy}` : ""}
        </p>
      )}

      {open && (
        <div className="flex flex-wrap gap-2">
          {item.type === "SUSPICIOUS_RATINGS" && (
            <>
              <Button size="sm" disabled={pending} onClick={() => resolve({ action: "release" })}>
                Approve (count them)
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => resolve({ action: "hide" })}
              >
                Reject (hide)
              </Button>
            </>
          )}
          {item.type === "DISH_PROPOSAL" && (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => setMode(mode === "create" ? "idle" : "create")}
              >
                Create dish…
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setMode(mode === "map" ? "idle" : "map")}
              >
                Map to a dish…
              </Button>
            </>
          )}
          {item.type === "RESTAURANT_PROPOSAL" && (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => setMode(mode === "create" ? "idle" : "create")}
              >
                Create restaurant…
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setMode(mode === "link" ? "idle" : "link")}
              >
                It exists: link…
              </Button>
            </>
          )}
          {item.type === "LOCATION_SUGGESTION" && (
            <Button size="sm" disabled={pending} onClick={() => resolve({ action: "approve" })}>
              Approve location
            </Button>
          )}
          {item.type === "FLAG" && (
            <>
              <Button size="sm" disabled={pending} onClick={() => resolve({ action: "uphold" })}>
                Done (acted on it)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => resolve({ action: "dismiss" })}
              >
                Dismiss
              </Button>
            </>
          )}
          {item.type !== "SUSPICIOUS_RATINGS" && item.type !== "FLAG" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => resolve({ action: "reject" })}
            >
              Reject
            </Button>
          )}
        </div>
      )}

      {open && item.type === "DISH_PROPOSAL" && mode === "create" && (
        <CreateDishForm
          defaultName={String(p.name)}
          categories={categories}
          pending={pending}
          onSubmit={(dish) => resolve({ action: "create_dish", payload: { dish } })}
        />
      )}
      {open && item.type === "DISH_PROPOSAL" && mode === "map" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const dishId = String(new FormData(e.currentTarget).get("dishId") ?? "");
            if (dishId) resolve({ action: "map_to_dish", payload: { dishId } });
          }}
        >
          <MapDishSelect dishes={dishes} />
          <Button size="sm" type="submit" disabled={pending}>
            Map
          </Button>
        </form>
      )}
      {open && item.type === "RESTAURANT_PROPOSAL" && mode === "create" && (
        <RestaurantCreateFields
          idPrefix={`proposal-${item.id}`}
          cities={formCities}
          defaultAreaId={String(p.areaId ?? "")}
          prefill={{ name: String(p.name ?? ""), address: null, phone: null, website: null }}
          dishes={launchDishes}
          defaultDishSlugs={[]}
          withLocation
          note="Check the place first (call or visit), then type its signboard name and a short address."
          submitLabel="Create restaurant"
          pending={pending}
          error={message?.error ? message.text : null}
          onSubmit={(restaurant) =>
            resolve({ action: "create_restaurant", payload: { restaurant } })
          }
        />
      )}
      {open && item.type === "RESTAURANT_PROPOSAL" && mode === "link" && (
        <RestaurantPicker
          cityId={String(p.cityId ?? "")}
          actionLabel="Link"
          disabled={pending}
          onPick={(r) => resolve({ action: "link_restaurant", payload: { restaurantId: r.id } })}
        />
      )}

      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={message.error ? "text-destructive" : "font-medium"}
        >
          {message.text}
        </p>
      )}
    </article>
  );
}

function LocationDetails({
  payload,
  restaurant,
}: {
  payload: Record<string, unknown>;
  restaurant: Item["restaurant"];
}) {
  const best = payload.best as { lat: number; lng: number; accuracyM: number } | undefined;
  const ids = (payload.observationIds as string[] | undefined) ?? [];
  if (!best) return null;
  return (
    <div className="flex flex-col gap-1">
      <p>
        Panel location: {best.lat.toFixed(5)}, {best.lng.toFixed(5)} (±{Math.round(best.accuracyM)}{" "}
        m, {ids.length} observation{ids.length === 1 ? "" : "s"}) ·{" "}
        <a
          href={osm(best.lat, best.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          map
        </a>
      </p>
      <p className="text-muted-foreground">
        {restaurant && restaurant.lat !== null && restaurant.lng !== null ? (
          <>
            Current: {restaurant.lat.toFixed(5)}, {restaurant.lng.toFixed(5)} (
            {restaurant.locationSource?.toLowerCase()}),{" "}
            {payload.distanceM !== null ? `${String(payload.distanceM)} m away` : ""} ·{" "}
            <a
              href={osm(restaurant.lat, restaurant.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              map
            </a>
          </>
        ) : (
          "The restaurant has no location yet."
        )}
      </p>
    </div>
  );
}

function MapDishSelect({ dishes }: { dishes: { id: string; slug: string; name: string }[] }) {
  return (
    <label className="flex flex-col gap-1">
      Existing dish
      <select name="dishId" required defaultValue="" className={selectClass}>
        <option value="" disabled>
          Choose a dish
        </option>
        {dishes.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function CreateDishForm({
  defaultName,
  categories,
  pending,
  onSubmit,
}: {
  defaultName: string;
  categories: { id: string; name: string }[];
  pending: boolean;
  onSubmit: (dish: { slug: string; name: string; categoryId: string; aliases: string[] }) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState(slugify(defaultName));
  return (
    <form
      className="flex flex-col gap-2 rounded-md bg-muted/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        onSubmit({
          slug,
          name: name.trim(),
          categoryId: String(form.get("categoryId") ?? ""),
          aliases: String(form.get("aliases") ?? "")
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
        });
      }}
    >
      <label className="flex flex-col gap-1">
        Name
        <Input
          value={name}
          required
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setSlug(slugify(e.target.value));
          }}
        />
      </label>
      <label className="flex flex-col gap-1">
        Slug
        <Input value={slug} required maxLength={80} onChange={(e) => setSlug(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        Category
        <select name="categoryId" required defaultValue="" className={selectClass}>
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Other spellings (comma-separated, Roman Urdu welcome)
        <Input name="aliases" maxLength={600} />
      </label>
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        Create dish
      </Button>
    </form>
  );
}
