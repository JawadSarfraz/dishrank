"use client";

// "Parse now" on /admin/menus/[id]: reads the photo with the vision model and matches its items.
// It waits for the result (up to a few minutes for a long menu).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { parseMenuNowAction } from "@/server/actions/admin-menus";
import { describeActionError } from "./action-error";

export function MenuParseButton({ uploadId, label }: { uploadId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  function parse() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await parseMenuNowAction(uploadId);
        if (res.error) {
          setMessage({ text: describeActionError(res.error), error: true });
          return;
        }
        const r = res.data;
        const tokens = r.usage.inputTokens + r.usage.matchInputTokens;
        const out = r.usage.outputTokens + r.usage.matchOutputTokens;
        setMessage(
          r.status === "FAILED"
            ? { text: `Failed: ${r.error}`, error: true }
            : {
                text: `Read ${r.items} items: ${r.matched} matched, ${r.needsReview} to review (${tokens} input and ${out} output tokens).`,
                error: false,
              },
        );
        router.refresh();
      } catch {
        setMessage({ text: "The request did not finish. Reload to see the result.", error: true });
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={parse} disabled={pending} className="h-11 w-fit px-5">
        {pending ? "Reading the menu…" : label}
      </Button>
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
