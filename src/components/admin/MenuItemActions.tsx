"use client";

// Decisions for a menu item the matcher could not place (docs/07 §6 UNMATCHED_MENU_ITEM): one tap
// on a suggestion assigns it, or pick another dish, create a dish (admin only) and assign it, or
// ignore the item (not a ranked dish, e.g. Raita). Used on /admin/review and /admin/menus/[id].
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resolveReviewItemAction } from "@/server/actions/admin-review";
import { describeActionError } from "./action-error";
import { CreateDishForm, MapDishSelect } from "./DishForms";

export type DishSuggestion = { dishId: string; slug: string; name: string; conf: number };

export function MenuItemActions({
  defaultName,
  suggestions,
  dishes,
  categories,
  pending,
  onResolve,
}: {
  defaultName: string;
  suggestions: DishSuggestion[];
  dishes: { id: string; slug: string; name: string }[];
  categories: { id: string; name: string }[];
  pending: boolean;
  onResolve: (input: Record<string, unknown>) => void;
}) {
  const [mode, setMode] = useState<"idle" | "map" | "create">("idle");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <Button
            key={s.dishId}
            size="sm"
            disabled={pending}
            onClick={() => onResolve({ action: "assign_dish", payload: { dishId: s.dishId } })}
          >
            {s.name} <span className="opacity-70">{s.conf.toFixed(2)}</span>
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setMode(mode === "map" ? "idle" : "map")}
        >
          Other dish…
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setMode(mode === "create" ? "idle" : "create")}
        >
          Create dish…
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => onResolve({ action: "ignore" })}
        >
          Ignore
        </Button>
      </div>
      {mode === "map" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const dishId = String(new FormData(e.currentTarget).get("dishId") ?? "");
            if (dishId) onResolve({ action: "assign_dish", payload: { dishId } });
          }}
        >
          <MapDishSelect dishes={dishes} />
          <Button size="sm" type="submit" disabled={pending}>
            Assign
          </Button>
        </form>
      )}
      {mode === "create" && (
        <CreateDishForm
          defaultName={defaultName}
          categories={categories}
          pending={pending}
          submitLabel="Create dish and assign"
          onSubmit={(dish) => onResolve({ action: "create_dish_and_assign", payload: { dish } })}
        />
      )}
    </div>
  );
}

/** One menu item waiting on the upload page: decides through the review queue, then reloads. */
export function MenuReviewRow({
  reviewItemId,
  fingerprint,
  ...props
}: Omit<Parameters<typeof MenuItemActions>[0], "pending" | "onResolve"> & {
  reviewItemId: string;
  fingerprint: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve(input: Record<string, unknown>) {
    startTransition(async () => {
      setError(null);
      try {
        const res = await resolveReviewItemAction(reviewItemId, input, fingerprint);
        if (res.error) {
          setError(describeActionError(res.error));
          if (res.error.code === "ITEM_CHANGED" || res.error.code === "ITEM_CLOSED")
            router.refresh();
          return;
        }
        router.refresh();
      } catch {
        setError("The decision did not reach the server. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <MenuItemActions {...props} pending={pending} onResolve={resolve} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
