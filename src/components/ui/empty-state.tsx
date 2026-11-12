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
  secondary,
  size = "default",
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  text?: string;
  action?: { href: string; label: string } | { onClick: () => void; label: string };
  /** A quieter second way on, next to the action. */
  secondary?: { href: string; label: string };
  size?: "default" | "compact";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-card border-[1.5px] border-dashed border-dash bg-card text-center",
        size === "compact" ? "gap-2 px-4 py-5" : "gap-3 px-5 py-8",
        className,
      )}
    >
      {icon && (
        <span className="flex size-12 items-center justify-center rounded-full bg-blush text-brand">
          {icon}
        </span>
      )}
      <p
        className={cn(
          "font-display font-extrabold",
          size === "compact" ? "text-[17px] leading-5" : "text-xl leading-6",
        )}
      >
        {title}
      </p>
      {text && <p className="max-w-prose text-sm text-muted-foreground">{text}</p>}
      {(action || secondary) && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {action &&
            ("href" in action ? (
              <ButtonLink href={action.href}>{action.label}</ButtonLink>
            ) : (
              <Button type="button" onClick={action.onClick}>
                {action.label}
              </Button>
            ))}
          {secondary && (
            <ButtonLink variant="outline" href={secondary.href}>
              {secondary.label}
            </ButtonLink>
          )}
        </div>
      )}
    </div>
  );
}
