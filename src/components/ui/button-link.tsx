import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * A link that looks like a button (a real <a>, so it keeps link semantics: "open in new tab",
 * the role screen readers announce, and Playwright's getByRole("link")). For actions use Button.
 */
export function ButtonLink({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
