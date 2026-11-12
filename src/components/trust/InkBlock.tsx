// The ink trust block's look (spec §4, Trust block) for a trust summary on the reading pages: ink
// ground, radius 24, padding 20, a white sub-section title and lines in #E9DED6 with white icons.
import { cn } from "cn";

export function InkBlock({
  title,
  icon,
  className,
  children,
}: {
  title?: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex max-w-prose flex-col gap-3 rounded-block bg-ink p-5 text-white",
        "[&_a]:font-bold [&_a]:text-white [&_a]:underline [&_a]:underline-offset-[3px] hover:[&_a]:text-trust-text",
        className,
      )}
    >
      {title && <p className="font-display text-xl leading-6 font-extrabold text-white">{title}</p>}
      <div className="flex items-start gap-3 text-[15px] leading-[22px] text-trust-text">
        {icon && (
          <span aria-hidden="true" className="mt-px shrink-0 text-white [&_svg]:size-5">
            {icon}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-2 [&_p]:max-w-none">{children}</div>
      </div>
    </section>
  );
}
