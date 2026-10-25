"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";

export type CreateFieldsValues = {
  name: string;
  /** The city of the chosen area. */
  cityId: string;
  areaId: string;
  address: string;
  phone?: string;
  priceBand?: number;
  aliases: string[];
};

/**
 * The Create form for one search result (docs/07 §2). Name and address always start empty: the
 * admin types the name as on the signboard or the restaurant's own page, and a short address in
 * their own words ("Jinnah Super, F-7 Markaz"). This component never
 * receives a Google name or address, so it cannot prefill one (CLAUDE.md rule 2).
 */
export function RestaurantCreateFields({
  idPrefix,
  cities,
  defaultAreaId,
  pending,
  error,
  onSubmit,
}: {
  idPrefix: string;
  /** Both cities with their areas: a search near the city line can find a place in the other city. */
  cities: { id: string; name: string; areas: { id: string; name: string }[] }[];
  /** The area that was searched; the admin can change it. */
  defaultAreaId: string;
  pending: boolean;
  error: string | null;
  onSubmit: (values: CreateFieldsValues) => void;
}) {
  const fieldId = (name: string) => `${idPrefix}-${name}`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const areaId = value("areaId");
    onSubmit({
      name: value("name"),
      cityId: cities.find((c) => c.areas.some((a) => a.id === areaId))?.id ?? "",
      areaId,
      address: value("address"),
      ...(value("phone") ? { phone: value("phone") } : {}),
      ...(value("priceBand") ? { priceBand: Number(value("priceBand")) } : {}),
      aliases: value("aliases")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      <p className="text-xs font-medium">
        Type the name as on the signboard or the restaurant&apos;s own page, and a short address in
        your own words (e.g. &quot;Jinnah Super, F-7 Markaz&quot;); nothing here is copied from
        Google.
      </p>
      <label htmlFor={fieldId("name")} className="flex flex-col gap-1 text-sm">
        Name
        <Input id={fieldId("name")} name="name" required maxLength={120} autoComplete="off" />
      </label>
      <label htmlFor={fieldId("area")} className="flex flex-col gap-1 text-sm">
        Area (where the restaurant really is; results can come from neighbouring areas)
        <select
          id={fieldId("area")}
          name="areaId"
          defaultValue={defaultAreaId}
          className={selectClass}
        >
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
        Address
        <textarea
          id={fieldId("address")}
          name="address"
          required
          maxLength={300}
          rows={2}
          autoComplete="off"
          className="rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm"
        />
      </label>
      <label htmlFor={fieldId("phone")} className="flex flex-col gap-1 text-sm">
        Phone (optional)
        <Input id={fieldId("phone")} name="phone" inputMode="tel" maxLength={20} />
      </label>
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
      <label htmlFor={fieldId("aliases")} className="flex flex-col gap-1 text-sm">
        Other names people search for (optional, comma-separated)
        <Input id={fieldId("aliases")} name="aliases" maxLength={600} />
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Confirm and create"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
