"use client";

// One dish of an owner's restaurant: confirm it is served, fix its menu name and price, or remove
// it (with an optional reason, logged). Scores and votes are shown, never who rated.
import { useState, useTransition } from "react";
import { describeActionError } from "@/components/admin/action-error";
import { Button } from "@/components/ui/button";
import { updateOwnerDishAction } from "@/server/actions/owner";

export function OwnerDishActions({
  rowId,
  dishName,
  status,
  menuName,
  price,
}: {
  rowId: string;
  dishName: string;
  status: string;
  menuName: string | null;
  price: number | null;
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "remove">("idle");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function send(input: Record<string, unknown>, done: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await updateOwnerDishAction(rowId, input);
        if (res.error) setMessage({ text: describeActionError(res.error), error: true });
        else {
          setMode("idle");
          setMessage({ text: done, error: false });
        }
      } catch {
        setMessage({ text: "The change did not reach us. Try again.", error: true });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status !== "OWNER_VERIFIED" && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => send({ action: "confirm" }, "Confirmed: you serve this dish.")}
          >
            Confirm we serve it
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setMode(mode === "edit" ? "idle" : "edit")}
        >
          Fix name or price…
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setMode(mode === "remove" ? "idle" : "remove")}
        >
          We don&apos;t serve it…
        </Button>
      </div>
      {mode === "edit" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            send(
              { action: "edit", menuName: form.get("menuName"), price: form.get("price") },
              "Saved.",
            );
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Name on your menu
            <input
              name="menuName"
              defaultValue={menuName ?? dishName}
              maxLength={120}
              className="field"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Price (Rs)
            <input
              name="price"
              type="number"
              inputMode="numeric"
              min={1}
              max={1000000}
              defaultValue={price ?? ""}
              className="field w-36"
            />
          </label>
          <Button size="sm" type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      )}
      {mode === "remove" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
            send(
              { action: "remove", ...(reason ? { reason } : {}) },
              "Removed. It no longer shows here or in the rankings.",
            );
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Why? (optional, for our team)
            <input name="reason" maxLength={280} className="field" />
          </label>
          <p className="text-sm text-muted-foreground">
            The dish leaves your page and the rankings. Only our team can bring it back.
          </p>
          <Button
            size="sm"
            type="submit"
            variant="destructive"
            disabled={pending}
            className="self-start"
          >
            Remove {dishName}
          </Button>
        </form>
      )}
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={message.error ? "text-sm text-destructive" : "text-sm"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
