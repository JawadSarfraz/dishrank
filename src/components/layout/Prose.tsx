import { cn } from "cn";

/**
 * Reading pages (about, how rankings work, privacy, terms, dispute, data sources): one column of
 * plain text in the "Garma Garam" type scale. The h1 is the page title (Display 32 / 34), h2 the
 * section title (Display 24 / 28), h3 the sub-section title (Display 20 / 24); body 16 / 24 in ink;
 * links ink, bold and underlined (brand-press on hover); lists get a small brand dot.
 */
export function Prose({ className, ...props }: React.ComponentProps<"article">) {
  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-4 text-base leading-6 text-ink",
        "[&_h1]:font-display [&_h1]:text-[32px] [&_h1]:leading-[34px] [&_h1]:font-extrabold [&_h1]:tracking-[-0.02em] [&_h1]:break-anywhere lg:[&_h1]:text-[40px] lg:[&_h1]:leading-[44px]",
        "[&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:leading-7 [&_h2]:font-extrabold [&_h2]:tracking-[-0.01em]",
        "[&_h3]:mt-2 [&_h3]:font-display [&_h3]:text-xl [&_h3]:leading-6 [&_h3]:font-extrabold",
        "[&_p]:max-w-prose",
        "[&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-brand-press",
        "[&_ul]:flex [&_ul]:max-w-prose [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5",
        "[&_ul>li]:relative [&_ul>li]:before:absolute [&_ul>li]:before:top-[9px] [&_ul>li]:before:-left-4 [&_ul>li]:before:size-1.5 [&_ul>li]:before:rounded-full [&_ul>li]:before:bg-brand",
        className,
      )}
      {...props}
    />
  );
}

/** A blush tint block (radius 24) for a callout inside a reading page. */
export function Callout({
  icon,
  className,
  children,
}: {
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex max-w-prose items-start gap-3 rounded-block bg-blush p-4 text-[15px] leading-[22px] text-ink [&_p]:max-w-none",
        className,
      )}
    >
      {icon && (
        <span aria-hidden="true" className="mt-px shrink-0 text-brand-dark [&_svg]:size-5">
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </div>
  );
}
