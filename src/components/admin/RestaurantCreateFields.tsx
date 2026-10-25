"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";

export type CreateFieldsValues = {
  name: string;
  areaId: string;
  address: string;
  phone?: string;
  website?: string;
  priceBand?: number;
  aliases: string[];
  dishSlugs: string[];
  lat?: number;
  lng?: number;
};

export type CreateFieldsPrefill = {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
};

/**
 * The form an admin confirms to create a restaurant (docs/07 §2). On /admin/import it starts with
 * Overture's name, address, phone and website (CLAUDE.md rule 2): the admin fixes the name to the
 * signboard spelling, checks the address and area, and ticks the launch dishes it serves. On
 * /admin/restaurants/new it starts empty and takes an optional location.
 */
export function RestaurantCreateFields({
  idPrefix,
  cities,
  defaultAreaId,
  prefill,
  dishes,
  defaultDishSlugs,
  withLocation,
  note,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  idPrefix: string;
  /** Both cities with their areas: a place near the city line may belong to the other city. */
  cities: { id: string; name: string; areas: { id: string; name: string }[] }[];
  /** "" = the admin has to choose. */
  defaultAreaId: string;
  prefill?: CreateFieldsPrefill;
  /** The launch dishes, as tick boxes. */
  dishes: { slug: string; name: string }[];
  defaultDishSlugs: string[];
  /** Latitude and longitude inputs (hand-added restaurants only). */
  withLocation: boolean;
  note: string;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (values: CreateFieldsValues) => void;
}) {
  const fieldId = (name: string) => `${idPrefix}-${name}`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const number = (key: string) => (value(key) ? Number(value(key)) : undefined);
    onSubmit({
      name: value("name"),
      areaId: value("areaId"),
      address: value("address"),
      ...(value("phone") ? { phone: value("phone") } : {}),
      ...(value("website") ? { website: value("website") } : {}),
      ...(value("priceBand") ? { priceBand: Number(value("priceBand")) } : {}),
      aliases: value("aliases")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      dishSlugs: form.getAll("dishSlugs").map(String),
      ...(withLocation && (value("lat") || value("lng"))
        ? { lat: number("lat"), lng: number("lng") }
        : {}),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      <p className="text-xs font-medium">{note}</p>
      <label htmlFor={fieldId("name")} className="flex flex-col gap-1 text-sm">
        Name (as on the signboard)
        <Input
          id={fieldId("name")}
          name="name"
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={prefill?.name.slice(0, 120)}
        />
      </label>
      <label htmlFor={fieldId("area")} className="flex flex-col gap-1 text-sm">
        Area
        <select
          id={fieldId("area")}
          name="areaId"
          required
          defaultValue={defaultAreaId}
          className={selectClass}
        >
          <option value="" disabled>
            Choose an area
          </option>
          {cities.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {c.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label htmlFor={fieldId("address")} className="flex flex-col gap-1 text-sm">
        Address (short, e.g. &quot;Jinnah Super, F-7 Markaz&quot;)
        <textarea
          id={fieldId("address")}
          name="address"
          required
          maxLength={300}
          rows={2}
          autoComplete="off"
          defaultValue={prefill?.address?.slice(0, 300) ?? ""}
          className="rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={fieldId("phone")} className="flex flex-1 flex-col gap-1 text-sm">
          Phone (optional)
          <Input
            id={fieldId("phone")}
            name="phone"
            inputMode="tel"
            maxLength={20}
            defaultValue={prefill?.phone ?? ""}
          />
        </label>
        <label htmlFor={fieldId("website")} className="flex flex-1 flex-col gap-1 text-sm">
          Website (optional)
          <Input
            id={fieldId("website")}
            name="website"
            type="url"
            maxLength={300}
            defaultValue={prefill?.website ?? ""}
          />
        </label>
      </div>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1">Launch dishes it serves</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
          {dishes.map((d) => (
            <label key={d.slug} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="dishSlugs"
                value={d.slug}
                defaultChecked={defaultDishSlugs.includes(d.slug)}
              />
              {d.name}
            </label>
          ))}
        </div>
      </fieldset>
      {withLocation && (
        <div className="flex flex-wrap gap-2">
          <label htmlFor={fieldId("lat")} className="flex flex-1 flex-col gap-1 text-sm">
            Latitude (optional)
            <Input id={fieldId("lat")} name="lat" inputMode="decimal" />
          </label>
          <label htmlFor={fieldId("lng")} className="flex flex-1 flex-col gap-1 text-sm">
            Longitude (optional)
            <Input id={fieldId("lng")} name="lng" inputMode="decimal" />
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label htmlFor={fieldId("price")} className="flex flex-col gap-1 text-sm">
          Price band (optional)
          <select id={fieldId("price")} name="priceBand" defaultValue="" className={selectClass}>
            <option value="">Not set</option>
            <option value="1">1 · budget</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4 · premium</option>
          </select>
        </label>
        <label htmlFor={fieldId("aliases")} className="flex flex-1 flex-col gap-1 text-sm">
          Other names people search for (optional, comma-separated)
          <Input id={fieldId("aliases")} name="aliases" maxLength={600} />
        </label>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
