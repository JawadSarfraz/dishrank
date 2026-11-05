import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// docs/12-DESIGN.md: every public button is at least 44 px tall (default and lg); sm and xs are for
// dense admin tables only. Keyboard focus shows a 2 px brand ring outside the button.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-brand-ink",
        outline: "border-border bg-card text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "h-auto rounded-sm px-0 text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 text-base",
        sm: "h-10 px-3 text-sm [&_svg:not([class*='size-'])]:size-4",
        xs: "h-8 gap-1.5 rounded-md px-2.5 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 px-5 text-base",
        icon: "size-11",
        "icon-sm": "size-10 [&_svg:not([class*='size-'])]:size-4",
        "icon-xs": "size-8 rounded-md [&_svg:not([class*='size-'])]:size-4",
      },
    },
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
