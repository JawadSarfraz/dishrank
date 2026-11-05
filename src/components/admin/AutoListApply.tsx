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
    try {
      for (;;) {
        const res = await applyAutoListAction({});
        if (res.error) {
          setStatus(`${created} created, then: ${describeActionError(res.error)}`);
          break;
        }
        const { remaining, failed, skipped } = res.data;
        created += res.data.created;
        dishLinks += res.data.dishLinks;
        setStatus(`${created} created, ${remaining} left…`);
        const unfinished =
          failed > 0 ? ` ${failed} could not be created and stay NEW; see the log.` : "";
        if (remaining === 0) {
          setStatus(
            `Done: ${created} restaurants created with ${dishLinks} dish links.${unfinished}`,
          );
          break;
        }
        // Nothing moved in this request: stop rather than ask again for ever, and never say "Done".
        if (res.data.created === 0 && skipped === 0) {
          setStatus(
            `${created} created and ${remaining} left. Apply again to carry on.${unfinished}`,
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
