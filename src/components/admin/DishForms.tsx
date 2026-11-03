"use client";

// Dish pickers for review decisions: map to an existing dish, or create one (admin only, docs/07 §6).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/slug";

export const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";

export type NewDishFields = { slug: string; name: string; categoryId: string; aliases: string[] };

export function MapDishSelect({
  dishes,
}: {
  dishes: { id: string; slug: string; name: string }[];
}) {
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

export function CreateDishForm({
  defaultName,
  categories,
  pending,
  onSubmit,
  submitLabel = "Create dish",
}: {
  defaultName: string;
  categories: { id: string; name: string }[];
  pending: boolean;
  onSubmit: (dish: NewDishFields) => void;
  submitLabel?: string;
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
        {submitLabel}
      </Button>
    </form>
  );
}
