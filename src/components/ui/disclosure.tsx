import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";

/**
 * A native <details> styled as a card: the optional parts of a page (report a problem, claim,
 * add details to a rating). Works without JavaScript; the chevron turns when open.
 */
export function Disclosure({
  id,
  summary,
  children,
  defaultOpen,
  className,
}: {
  /** A link target: a page can open and scroll to the section. */
  id?: string;
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className={cn("group/disclosure rounded-xl border bg-card shadow-card", className)}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-base font-medium select-none [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground transition-transform group-open/disclosure:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-3 px-4 pt-1 pb-4">{children}</div>
    </details>
  );
}
