import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// docs/12-DESIGN.md ("Garma Garam"): Primary is brand red, 52 px, radius 16, white 16 px bold;
// Outline is white with a 1.5 px ink border, radius 14; the Rate pill is blush with brand-dark
// text, radius 999. Every public button is at least 44 px tall (sm and xs are for dense admin tables
// only). Press: 120 ms ease-out, scale 0.98. Keyboard focus: a 2 px ink outline, 2 px out.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 border border-transparent font-bold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-[120ms] ease-out outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          "rounded-button bg-primary text-primary-foreground hover:bg-brand-dark active:bg-brand-press disabled:bg-line disabled:text-muted-foreground",
        /** Primary on dish pages: 56 px with the cta shadow (size xl). */
        cta: "rounded-button bg-primary text-primary-foreground shadow-cta hover:bg-brand-dark active:bg-brand-press disabled:bg-line disabled:text-muted-foreground disabled:shadow-none",
        outline:
          "rounded-field border-[1.5px] border-ink bg-card text-ink hover:bg-sand aria-expanded:bg-sand disabled:border-line-strong disabled:text-muted-foreground",
        /** The Rate pill (spec §4): blush, brand-dark text, fully round. */
        pill: "rounded-full bg-blush text-brand-dark hover:bg-blush-strong",
        secondary: "rounded-field bg-secondary text-secondary-foreground hover:bg-blush-strong",
        ghost: "rounded-field text-ink hover:bg-sand aria-expanded:bg-sand",
        /** A round icon button (44 px white circle); add shadow-float on photos and tiles. */
        round: "rounded-full bg-card text-ink hover:bg-sand active:scale-[0.96]",
        destructive: "rounded-field bg-destructive text-white hover:bg-destructive/90",
        link: "h-auto min-h-11 rounded-sm px-0 text-sm text-ink underline underline-offset-4 hover:text-brand-press",
      },
      size: {
        default: "h-12 px-5 text-base",
        sm: "h-10 px-3 text-sm [&_svg:not([class*='size-'])]:size-4",
        xs: "h-8 gap-1.5 px-2.5 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-13 px-6 text-base",
        xl: "h-14 px-6 text-[17px]",
        pill: "h-11 px-5 text-[15px]",
        icon: "size-11",
        "icon-sm": "size-10 [&_svg:not([class*='size-'])]:size-4",
        "icon-xs": "size-8 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    compoundVariants: [
      { variant: "link", class: "h-auto px-0" },
      { variant: "pill", size: "default", class: "h-11 px-5 text-[15px]" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
