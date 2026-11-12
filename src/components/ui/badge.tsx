import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// Small labels. The default is the status badge (spec §4): a blush pill with brand-dark 13 px
// bold text ("New list · 4 votes rank a place"); add `dot` for the 8 px brand dot in front. Admin
// labels use the smaller variants. Never a score (that is ScorePill with its rater count).
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent font-bold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "min-h-7 bg-blush px-3 py-1 text-[13px] leading-[18px] text-brand-dark",
        secondary: "h-6 bg-sand px-2.5 text-xs text-ink",
        outline: "h-6 border-line-strong bg-card px-2.5 text-xs text-ink",
        destructive: "h-6 bg-destructive/10 px-2.5 text-xs text-destructive",
        gold: "h-6 bg-gold-tint px-2.5 text-xs text-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  dot = false,
  render,
  children,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
        children: (
          <>
            {dot && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand" />}
            {children}
          </>
        ),
      },
      props,
    ),
    render,
    state: { slot: "badge", variant },
  });
}

export { Badge, badgeVariants };
