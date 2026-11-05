"use client";

// Auto-list Apply: one batch per request until nothing is left, so a long run shows progress and an
// interrupted one simply carries on when the button is pressed again.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { applyAutoListAction } from "@/server/actions/admin-import";
import { describeActionError } from "./action-error";

export function AutoListApply({ toCreate }: { toCreate: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function apply() {
    const word = toCreate === 1 ? "restaurant" : "restaurants";
    if (!window.confirm(`Create ${toCreate} public ${word} from Overture?`)) return;
    setRunning(true);
    let created = 0;
    let dishLinks = 0;
    let failed = 0;
    try {
      for (;;) {
        const res = await applyAutoListAction({});
        if (res.error) {
          setStatus(`${created} created, then: ${describeActionError(res.error)}`);
          break;
        }
        created += res.data.created;
        dishLinks += res.data.dishLinks;
        failed += res.data.failed;
        setStatus(`${created} created, ${res.data.remaining} left…`);
        if (res.data.remaining === 0 || res.data.created === 0) {
          setStatus(
            `Done: ${created} restaurants created with ${dishLinks} dish links.` +
              (failed > 0 ? ` ${failed} could not be created and stay NEW; see the log.` : ""),
          );
          break;
        }
      }
    } catch {
      setStatus(`${created} created, then the connection failed. Apply again to carry on.`);
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={apply} disabled={running || toCreate === 0}>
        {running ? "Creating…" : `Apply: create ${toCreate}`}
      </Button>
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </div>
  );
}
