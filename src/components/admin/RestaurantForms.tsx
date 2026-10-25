"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  mergeRestaurantAction,
  setRestaurantStatusAction,
  updateRestaurantAction,
} from "@/server/actions/admin-restaurants";
import { describeActionError } from "./action-error";
import { RestaurantPicker, type PickedRestaurant } from "./RestaurantPicker";

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";

export type EditableRestaurant = {
  id: string;
  name: string;
  areaId: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  priceBand: number | null;
  aliases: string[];
  lat: number | null;
  lng: number | null;
};

function Message({ text, error }: { text: string | null; error?: boolean }) {
  if (!text) return null;
  return (
    <p role={error ? "alert" : "status"} className={error ? "text-sm text-destructive" : "text-sm"}>
      {text}
    </p>
  );
}

export function RestaurantEditForm({
  restaurant,
  areas,
}: {
  restaurant: EditableRestaurant;
  areas: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const input = {
      name: value("name"),
      areaId: value("areaId"),
      address: value("address"),
      phone: value("phone") || null,
      website: value("website") || null,
      priceBand: value("priceBand") ? Number(value("priceBand")) : null,
      aliases: value("aliases")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      lat: value("lat") ? Number(value("lat")) : null,
      lng: value("lng") ? Number(value("lng")) : null,
    };
    startTransition(async () => {
      const res = await updateRestaurantAction(restaurant.id, input);
      setMessage(
        res.error
          ? { text: describeActionError(res.error), error: true }
          : { text: "Saved.", error: false },
      );
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <Input name="name" defaultValue={restaurant.name} required maxLength={120} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Area
        <select
          name="areaId"
          defaultValue={restaurant.areaId ?? ""}
          required
          className={selectClass}
        >
          <option value="" disabled>
            Choose an area
          </option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Address
        <textarea
          name="address"
          defaultValue={restaurant.address ?? ""}
          required
          maxLength={300}
          rows={2}
          className="rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Phone
        <Input name="phone" defaultValue={restaurant.phone ?? ""} inputMode="tel" maxLength={20} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Website
        <Input name="website" type="url" defaultValue={restaurant.website ?? ""} maxLength={300} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Price band
        <select
          name="priceBand"
          defaultValue={restaurant.priceBand?.toString() ?? ""}
          className={selectClass}
        >
          <option value="">Not set</option>
          <option value="1">1 · budget</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4 · premium</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Other names people search for (comma-separated)
        <Input name="aliases" defaultValue={restaurant.aliases.join(", ")} maxLength={600} />
      </label>
      <p className="text-xs text-muted-foreground">
        Changing the coordinates marks them as typed by an admin; clear both if the location is
        unknown.
      </p>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Latitude
          <Input name="lat" defaultValue={restaurant.lat?.toString() ?? ""} inputMode="decimal" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Longitude
          <Input name="lng" defaultValue={restaurant.lng?.toString() ?? ""} inputMode="decimal" />
        </label>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
      <Message text={message?.text ?? null} error={message?.error} />
    </form>
  );
}

export function RestaurantStatusForm({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = String(new FormData(event.currentTarget).get("status"));
    startTransition(async () => {
      const res = await setRestaurantStatusAction(id, { status: next });
      setMessage(
        res.error
          ? { text: describeActionError(res.error), error: true }
          : { text: `Status: ${res.data.status}.`, error: false },
      );
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select name="status" defaultValue={status} className={selectClass}>
          <option value="ACTIVE">ACTIVE (listed)</option>
          <option value="CLOSED">CLOSED</option>
          <option value="HIDDEN">HIDDEN</option>
        </select>
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        Change status
      </Button>
      <Message text={message?.text ?? null} error={message?.error} />
    </form>
  );
}

/** Merge this restaurant into another (docs/07 §2): this one becomes a duplicate and redirects. */
export function MergeRestaurantDialog({
  source,
  cityId,
}: {
  source: { id: string; name: string };
  cityId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<PickedRestaurant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function merge() {
    if (!target) return;
    startTransition(async () => {
      const res = await mergeRestaurantAction(source.id, { mergeIntoId: target.id });
      if (res.error) {
        setError(describeActionError(res.error));
        return;
      }
      setOpen(false);
      router.push(`/admin/restaurants/${res.data.target.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTarget(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="destructive" />}>Merge into another…</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge {source.name}</DialogTitle>
          <DialogDescription>
            {source.name} becomes a duplicate: its dishes, ratings, flags, menu photos and claims
            move to the restaurant you pick, and its page redirects there. This cannot be undone
            from the admin.
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Merge <strong>{source.name}</strong> into <strong>{target.name}</strong> (
              {target.areaName ?? "no area"})?
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" disabled={pending} onClick={merge}>
                {pending ? "Merging…" : "Merge"}
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => setTarget(null)}>
                Pick another
              </Button>
            </div>
          </div>
        ) : (
          <RestaurantPicker
            cityId={cityId}
            excludeId={source.id}
            actionLabel="Choose"
            onPick={setTarget}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
