"use client";

// /admin/contenders: the list as the public sees it, the linked places the rule keeps out, the
// removed ones, and two ways to add: a listed restaurant by name (to this dish and any others
// ticked, one tap), or a restaurant the site does not have yet.
import { ExternalLinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AdminList } from "@/components/admin/AdminPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { formatScore, formatVotes } from "@/lib/format";
import { addContendersAction, setContenderRowAction } from "@/server/actions/admin-contenders";
import type { CurationEntry } from "@/server/services/contenders.service";
import { describeActionError } from "./action-error";
import { RestaurantPicker } from "./RestaurantPicker";

type Props = {
  city: { id: string; slug: string; name: string };
  dish: { slug: string; name: string };
  dishes: { slug: string; name: string }[];
  contenders: CurationEntry[];
  hidden: (CurationEntry & { why: string })[];
  removed: CurationEntry[];
};

function State({ row }: { row: CurationEntry }) {
  if (row.rankInCity !== null && row.score !== null) {
    return (
      <>
        #{row.rankInCity} · {formatScore(row.score)} · {formatVotes(row.votes)}
      </>
    );
  }
  if (row.votes > 0) return <>{formatVotes(row.votes)}</>;
  return <>{row.autoListed ? "checked" : "added by hand"}</>;
}

function Row({
  row,
  citySlug,
  children,
}: {
  row: CurationEntry;
  citySlug: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-center gap-1.5">
          <a
            href={`/admin/restaurants/${row.restaurantId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.name}
          </a>
          <a
            href={`/${citySlug}/r/${row.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${row.name}, public page`}
            className="text-muted-foreground"
          >
            <ExternalLinkIcon aria-hidden="true" className="size-4" />
          </a>
        </span>
        <span className="text-muted-foreground">
          {row.area ?? "no area"} · <State row={row} />
        </span>
      </span>
      {children}
    </li>
  );
}

export function ContenderCuration({ city, dish, dishes, contenders, hidden, removed }: Props) {
  const router = useRouter();
  const [also, setAlso] = useState<string[]>([]);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    work: () => Promise<{ error?: { code: string; message: string } | null }>,
    done: string,
  ) {
    startTransition(async () => {
      let res;
      try {
        res = await work();
      } catch {
        setMessage({ text: "The request did not reach the server. Try again.", error: true });
        return;
      }
      if (res.error) {
        setMessage({ text: describeActionError(res.error), error: true });
        return;
      }
      setMessage({ text: done, error: false });
      router.refresh();
    });
  }
  const add = (restaurantId: string, name: string, slugs: string[]) =>
    run(
      () => addContendersAction({ restaurantId, dishSlugs: slugs }),
      `${name} added to ${slugs.length === 1 ? dish.name : `${slugs.length} dishes`}.`,
    );
  const setRow = (row: CurationEntry, action: "remove" | "restore") =>
    run(
      () => setContenderRowAction({ restaurantDishId: row.id, action }),
      action === "remove" ? `${row.name} taken off ${dish.name}.` : `${row.name} is back.`,
    );

  const others = dishes.filter((d) => d.slug !== dish.slug);
  const picked = [dish.slug, ...also];

  return (
    <div className="flex flex-col gap-6 text-sm">
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={message.error ? "text-destructive" : "font-medium"}
        >
          {message.text}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">
          On the list: {dish.name} in {city.name} ({contenders.length})
        </h2>
        {contenders.length === 0 ? (
          <p className="text-muted-foreground">Nobody yet. Add the places that belong here.</p>
        ) : (
          <AdminList>
            {contenders.map((row) => (
              <Row key={row.id} row={row} citySlug={city.slug}>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setRow(row, "remove")}
                >
                  Remove
                </Button>
              </Row>
            ))}
          </AdminList>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-card">
        <h2 className="text-lg font-bold">Add a listed restaurant</h2>
        <p className="text-muted-foreground">
          Search the city&apos;s listings. Adding ticks the dish and marks the listing checked, so
          it shows on the public list at once.
        </p>
        {others.length > 0 && (
          <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <legend className="mb-1 font-medium">Also add to</legend>
            {others.map((d) => (
              <label key={d.slug} className="inline-flex min-h-9 items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={also.includes(d.slug)}
                  onChange={(e) =>
                    setAlso((cur) =>
                      e.target.checked ? [...cur, d.slug] : cur.filter((s) => s !== d.slug),
                    )
                  }
                />
                {d.name}
              </label>
            ))}
          </fieldset>
        )}
        <RestaurantPicker
          cityId={city.id}
          actionLabel={
            picked.length === 1 ? `Add to ${dish.name}` : `Add to ${picked.length} dishes`
          }
          disabled={pending}
          onPick={(r) => add(r.id, r.name, picked)}
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-muted-foreground">Not on the site at all?</span>
          <ButtonLink
            variant="outline"
            size="sm"
            href={`/admin/restaurants/new?dish=${encodeURIComponent(picked.join(","))}`}
          >
            Add a missing restaurant
          </ButtonLink>
        </div>
      </section>

      {hidden.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Linked, not shown ({hidden.length})</h2>
          <p className="text-muted-foreground">
            These have {dish.name} ticked but stay off the public list: nobody has checked the
            listing. Add the ones that belong; leave the rest.
          </p>
          <AdminList>
            {hidden.map((row) => (
              <Row key={row.id} row={row} citySlug={city.slug}>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{row.why}</Badge>
                  {row.why === "unchecked listing" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => add(row.restaurantId, row.name, picked)}
                    >
                      Add
                    </Button>
                  )}
                </span>
              </Row>
            ))}
          </AdminList>
        </section>
      )}

      {removed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Removed ({removed.length})</h2>
          <AdminList>
            {removed.map((row) => (
              <Row key={row.id} row={row} citySlug={city.slug}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setRow(row, "restore")}
                >
                  Add back
                </Button>
              </Row>
            ))}
          </AdminList>
        </section>
      )}
    </div>
  );
}
