// Who runs Kahan Khayen and how to reach them, on /privacy and /terms (OPERATOR_NAME, CONTACT_EMAIL,
// docs/10). A missing value shows a placeholder that is plainly not finished text.
import { OPERATOR } from "@/server/site";

function Placeholder({ text }: { text: string }) {
  return (
    <span className="rounded border border-dashed bg-card px-1.5 font-mono text-sm text-muted-foreground">
      [{text}]
    </span>
  );
}

export function OperatorName() {
  return OPERATOR.name ? (
    <>{OPERATOR.name}</>
  ) : (
    <Placeholder text="operator name: set OPERATOR_NAME" />
  );
}

export function ContactEmail() {
  return OPERATOR.email ? (
    <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
  ) : (
    <Placeholder text="contact e-mail: set CONTACT_EMAIL" />
  );
}
