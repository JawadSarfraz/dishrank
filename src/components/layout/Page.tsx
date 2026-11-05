import { cn } from "cn";

const WIDTHS = {
  /** Reading pages and forms: sign-in, /me, the trust pages, the rate flow. */
  narrow: "max-w-xl",
  /** Home, city, ranking and restaurant pages. */
  default: "max-w-3xl",
  /** Admin and owner tables. */
  wide: "max-w-5xl",
} as const;

/** The page column: 16 px gutters on phones, 24 px from 640 px up, never wider than its width. */
export function Main({
  width = "default",
  className,
  ...props
}: React.ComponentProps<"main"> & { width?: keyof typeof WIDTHS }) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8",
        WIDTHS[width],
        className,
      )}
      {...props}
    />
  );
}

/** A page's title block: optional eyebrow (a chip or breadcrumb), the h1, and one line under it. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-2", className)}>
      {eyebrow && <div className="flex flex-wrap items-center gap-2 text-sm">{eyebrow}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 text-3xl font-extrabold break-anywhere sm:text-4xl">{title}</h1>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {lede && <p className="max-w-prose text-base text-muted-foreground">{lede}</p>}
    </header>
  );
}

/** A section title with an optional link on the right ("All dishes"). */
export function SectionHeader({
  id,
  title,
  aside,
  className,
}: {
  id?: string;
  title: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      {aside}
    </div>
  );
}
