import { PencilLineIcon } from "lucide-react";

// Shown on the privacy and terms drafts until a lawyer has reviewed them (docs/OPEN-QUESTIONS.md).
// A blush tint block with the status badge's dot colour on its icon.
export function LegalDraftNotice() {
  return (
    <p
      role="note"
      className="flex max-w-prose items-start gap-3 rounded-block bg-blush p-4 text-sm leading-5 font-semibold text-ink"
    >
      <PencilLineIcon aria-hidden="true" className="mt-px size-5 shrink-0 text-brand-dark" />
      <span>
        Draft for legal review. This text has not been checked by a lawyer yet and may change.
      </span>
    </p>
  );
}
