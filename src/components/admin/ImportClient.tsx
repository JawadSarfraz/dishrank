"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  importCreateAction,
  importLinkAction,
  previewImportAction,
} from "@/server/actions/admin-import";
import type { ImportPreview, PreviewRow } from "@/server/services/import.service";
import { describeActionError } from "./action-error";
import { GoogleMapsAttribution } from "./GoogleMapsAttribution";
import { RestaurantPicker } from "./RestaurantPicker";

type City = { id: string; slug: string; name: string };
type PreviewCity = ImportPreview["city"];
type ActionableRow = Exclude<PreviewRow, { status: "rejected" }>;
type Outcome = {
  kind: "created" | "linked" | "unchanged" | "skipped" | "error";
  message: string;
  restaurantId?: string;
};

const FILTERS = [
  ["todo", "To do"],
  ["new", "New"],
  ["possible_duplicate", "Possible duplicates"],
  ["imported", "Already imported"],
  ["rejected", "Rejected"],
  ["done", "Done"],
  ["all", "All"],
] as const;
type Filter = (typeof FILTERS)[number][0];

const STATUS_LABEL: Record<PreviewRow["status"], string> = {
  new: "New",
  possible_duplicate: "Possible duplicate",
  imported: "Already imported",
  rejected: "Rejected",
};

const PAGE = 50;
const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";

function isDone(outcome: Outcome | undefined): boolean {
  return Boolean(outcome && outcome.kind !== "error");
}

function matches(row: PreviewRow, filter: Filter, outcome: Outcome | undefined): boolean {
  if (filter === "all") return true;
  if (filter === "done") return isDone(outcome);
  if (filter === "todo") return row.status !== "rejected" && !isDone(outcome);
  return row.status === filter;
}

export function ImportClient({ cities }: { cities: City[] }) {
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [filter, setFilter] = useState<Filter>("todo");
  const [limit, setLimit] = useState(PAGE);
  const [pending, startTransition] = useTransition();

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const name = event.target.files?.[0]?.name ?? "";
    const city = cities.find((c) => name.startsWith(`candidates-${c.slug}-`));
    if (city) setCityId(city.id);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await previewImportAction(form);
      if (res.error) {
        setError(describeActionError(res.error));
        setPreview(null);
        return;
      }
      setError(null);
      setPreview(res.data);
      setOutcomes({});
      setFilter("todo");
      setLimit(PAGE);
    });
  }

  const counts = useMemo(() => {
    const result = {} as Record<Filter, number>;
    for (const [key] of FILTERS) {
      result[key] = preview?.rows.filter((r) => matches(r, key, outcomes[r.line])).length ?? 0;
    }
    return result;
  }, [preview, outcomes]);

  const visible = preview?.rows.filter((r) => matches(r, filter, outcomes[r.line])) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex flex-col gap-1 text-sm">
          Candidates CSV from tmp/ (written by pnpm seed:places)
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            onChange={onFile}
            className="text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          City of this file
          <select
            name="cityId"
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
            className={selectClass}
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Reading…" : "Preview"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>

      {preview && (
        <section className="flex flex-col gap-3" aria-label="Preview">
          <p className="text-sm">
            {preview.rows.length} rows for {preview.city.name}: {preview.counts.new} new,{" "}
            {preview.counts.possible_duplicate} possible duplicates, {preview.counts.imported}{" "}
            already imported, {preview.counts.rejected} rejected. Nothing is saved until you confirm
            a Create form or click Link.
          </p>
          <GoogleMapsAttribution />
          <div role="group" aria-label="Filter rows" className="flex flex-wrap gap-2">
            {FILTERS.map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={filter === key ? "default" : "outline"}
                aria-pressed={filter === key}
                onClick={() => {
                  setFilter(key);
                  setLimit(PAGE);
                }}
              >
                {label} ({counts[key]})
              </Button>
            ))}
          </div>
          <ul className="flex flex-col gap-3">
            {visible.slice(0, limit).map((row) => (
              <li key={row.line}>
                {row.status === "rejected" ? (
                  <RejectedRow row={row} />
                ) : (
                  <RowCard
                    row={row}
                    city={preview.city}
                    outcome={outcomes[row.line]}
                    onOutcome={(o) => setOutcomes((prev) => ({ ...prev, [row.line]: o }))}
                  />
                )}
              </li>
            ))}
          </ul>
          {visible.length > limit && (
            <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({visible.length - limit} left)
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

function RejectedRow({ row }: { row: Extract<PreviewRow, { status: "rejected" }> }) {
  return (
    <article className="flex flex-col gap-1 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      <p className="font-medium">
        {row.displayName || row.googlePlaceId || "(empty row)"} · line {row.line}
      </p>
      <ul className="list-disc pl-5">
        {row.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </article>
  );
}

function RowCard({
  row,
  city,
  outcome,
  onOutcome,
}: {
  row: ActionableRow;
  city: PreviewCity;
  outcome: Outcome | undefined;
  onOutcome: (outcome: Outcome) => void;
}) {
  const [mode, setMode] = useState<"idle" | "create" | "link">("idle");
  const [pending, startTransition] = useTransition();
  const c = row.candidate;
  const done = isDone(outcome);

  function link(target: { id: string }) {
    startTransition(async () => {
      const res = await importLinkAction({
        restaurantId: target.id,
        googlePlaceId: c.googlePlaceId,
        lat: c.lat,
        lng: c.lng,
        fetchedAt: c.fetchedAt,
        dishSlug: c.dishSlug,
      });
      if (res.error) {
        onOutcome({ kind: "error", message: describeActionError(res.error) });
        return;
      }
      const data = res.data;
      if (data.outcome === "possible_duplicate") {
        onOutcome({ kind: "unchanged", message: data.message, restaurantId: data.restaurant.id });
        return;
      }
      setMode("idle");
      onOutcome({
        kind: "linked",
        restaurantId: data.restaurant.id,
        message:
          `Linked to ${data.restaurant.name}: ` +
          (data.restaurantDish.created
            ? `${row.dish.name} added as a candidate`
            : `${row.dish.name} was already there`) +
          (data.placeLinked ? "; Google place and location saved." : "."),
      });
    });
  }

  return (
    <article
      className={`flex flex-col gap-2 rounded-lg border p-3 ${done ? "opacity-60" : ""}`}
      aria-label={`Line ${row.line}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">{c.displayName || "(no name)"}</h2>
        <Badge variant={row.status === "new" ? "secondary" : "outline"}>
          {STATUS_LABEL[row.status]}
        </Badge>
      </header>
      <p className="text-sm text-muted-foreground">{c.formattedAddress || "(no address)"}</p>
      <p className="text-sm">
        {row.dish.name} · nearest area {row.suggestedArea.name} ({row.suggestedArea.distanceKm} km)
        · searched in {c.queryArea} · fetched {Math.floor(row.ageDays)} days ago · line {row.line}
      </p>
      {row.warnings.map((warning) => (
        <p key={warning} className="text-sm text-amber-700 dark:text-amber-400">
          Warning: {warning}
        </p>
      ))}

      {row.existing && (
        <p className="text-sm">
          Already imported as{" "}
          <Link href={`/admin/restaurants/${row.existing.id}`} className="underline">
            {row.existing.name}
          </Link>{" "}
          ({row.existing.areaName ?? "no area"})
          {row.existing.hasDish ? `; it already has ${row.dish.name}.` : "."}
        </p>
      )}

      {row.duplicates.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <p>Possible duplicate of:</p>
          <ul className="flex flex-col gap-1">
            {row.duplicates.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <span>
                  <Link href={`/admin/restaurants/${d.id}`} className="underline">
                    {d.name}
                  </Link>{" "}
                  ({d.areaName ?? "no area"}, similarity {d.similarity})
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending || done}
                  onClick={() => link(d)}
                >
                  Link
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outcome && (
        <p
          role="status"
          className={outcome.kind === "error" ? "text-sm text-destructive" : "text-sm font-medium"}
        >
          {outcome.message}{" "}
          {outcome.restaurantId && outcome.kind !== "error" && (
            <Link href={`/admin/restaurants/${outcome.restaurantId}`} className="underline">
              Open
            </Link>
          )}
        </p>
      )}

      {!done && (
        <div className="flex flex-wrap gap-2">
          {row.existing ? (
            !row.existing.hasDish && (
              <Button size="sm" disabled={pending} onClick={() => link(row.existing!)}>
                Add {row.dish.name} to it
              </Button>
            )
          ) : (
            <>
              <Button
                size="sm"
                aria-expanded={mode === "create"}
                onClick={() => setMode(mode === "create" ? "idle" : "create")}
              >
                {row.status === "possible_duplicate" ? "Create anyway" : "Create"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-expanded={mode === "link"}
                onClick={() => setMode(mode === "link" ? "idle" : "link")}
              >
                Link to…
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOutcome({ kind: "skipped", message: "Skipped." })}
          >
            Skip
          </Button>
        </div>
      )}

      {!done && mode === "create" && (
        <CreateForm
          row={row}
          city={city}
          onCreated={(o) => {
            setMode("idle");
            onOutcome(o);
          }}
        />
      )}
      {!done && mode === "link" && (
        <RestaurantPicker cityId={city.id} actionLabel="Link" disabled={pending} onPick={link} />
      )}
    </article>
  );
}

/** docs/07 §2 Create: prefilled from the CSV; the admin checks, edits and confirms. */
function CreateForm({
  row,
  city,
  onCreated,
}: {
  row: ActionableRow;
  city: PreviewCity;
  onCreated: (outcome: Outcome) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const c = row.candidate;
  const fieldId = (name: string) => `create-${row.line}-${name}`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const input = {
      name: value("name"),
      cityId: city.id,
      areaId: value("areaId"),
      address: value("address"),
      lat: c.lat,
      lng: c.lng,
      googlePlaceId: c.googlePlaceId,
      fetchedAt: c.fetchedAt,
      dishSlug: c.dishSlug,
      ...(value("phone") ? { phone: value("phone") } : {}),
      ...(value("priceBand") ? { priceBand: Number(value("priceBand")) } : {}),
      aliases: value("aliases")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    };
    startTransition(async () => {
      const res = await importCreateAction(input);
      if (res.error) {
        setError(describeActionError(res.error));
        return;
      }
      onCreated({
        kind: "created",
        restaurantId: res.data.restaurant.id,
        message: `Created ${res.data.restaurant.name} (${res.data.restaurant.slug}) with ${row.dish.name}.`,
      });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      <p className="text-xs">
        Check the name and address against the signboard, the restaurant&apos;s own page or a visit,
        and correct them: what you confirm is saved as our record. Phone and price band are never
        fetched from Google; type them if you know them.
      </p>
      <label htmlFor={fieldId("name")} className="flex flex-col gap-1 text-sm">
        Name
        <Input
          id={fieldId("name")}
          name="name"
          defaultValue={c.displayName.slice(0, 120)}
          required
          maxLength={120}
        />
      </label>
      <label htmlFor={fieldId("area")} className="flex flex-col gap-1 text-sm">
        Area
        <select
          id={fieldId("area")}
          name="areaId"
          defaultValue={row.suggestedArea.id}
          className={selectClass}
        >
          {city.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={fieldId("address")} className="flex flex-col gap-1 text-sm">
        Address
        <textarea
          id={fieldId("address")}
          name="address"
          defaultValue={c.formattedAddress.slice(0, 300)}
          required
          maxLength={300}
          rows={2}
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
