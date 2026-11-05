import { PencilLineIcon } from "lucide-react";

// Shown on the privacy and terms drafts until a lawyer has reviewed them (docs/OPEN-QUESTIONS.md).
export function LegalDraftNotice() {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-xl border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground"
    >
      <PencilLineIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        Draft for legal review. This text has not been checked by a lawyer yet and may change.
      </span>
    </p>
  );
}
