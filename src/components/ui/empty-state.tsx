import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";

/**
 * Every empty list gets one of these (owner, Part 3): what is missing, in one line, and one clear
 * next action. The app starts with no ratings, so this is often the first thing a visitor sees.
 */
export function EmptyState({
  icon,
  title,
  text,
  action,
  size = "default",
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  text?: string;
  action?: { href: string; label: string } | { onClick: () => void; label: string };
  size?: "default" | "compact";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed bg-card text-center",
        size === "compact" ? "gap-2 px-4 py-5" : "gap-3 px-5 py-8",
        className,
      )}
    >
      {icon && (
        <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          {icon}
        </span>
      )}
      <p className={cn("font-display font-bold", size === "compact" ? "text-base" : "text-lg")}>
        {title}
      </p>
      {text && <p className="max-w-prose text-sm text-muted-foreground">{text}</p>}
      {action &&
        ("href" in action ? (
          <ButtonLink href={action.href} className="mt-1">
            {action.label}
          </ButtonLink>
        ) : (
          <Button type="button" onClick={action.onClick} className="mt-1">
            {action.label}
          </Button>
        ))}
    </div>
  );
}
