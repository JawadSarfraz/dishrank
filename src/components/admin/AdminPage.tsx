import { cn } from "cn";

/** An admin page's title block: the h1, one line of help and an optional action on the right. */
export function AdminHeader({
  title,
  help,
  actions,
}: {
  title: React.ReactNode;
  help?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {help && <p className="max-w-prose text-sm text-muted-foreground">{help}</p>}
    </header>
  );
}

/** A row of links that act as tabs (status, type), the current one filled. */
export function AdminTabs({
  label,
  items,
  className,
}: {
  label: string;
  items: { href: string; label: React.ReactNode; active: boolean }[];
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("-mx-1 flex flex-wrap gap-1 overflow-x-auto px-1", className)}
    >
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center rounded-full border px-3 text-sm font-medium whitespace-nowrap",
            item.active
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-card hover:bg-muted",
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

/** A white list of rows (the admin's tables): divide-y, rounded, bordered. */
export function AdminList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "flex flex-col divide-y overflow-hidden rounded-xl border bg-card text-sm shadow-card",
        className,
      )}
      {...props}
    />
  );
}

/** A short notice above a list (a job that is not set up, a count). */
export function AdminNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      role="status"
      className={cn("rounded-xl border bg-card px-4 py-3 text-sm shadow-card", className)}
      {...props}
    />
  );
}
