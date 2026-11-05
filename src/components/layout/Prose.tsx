import { cn } from "cn";

/** Reading pages (about, how rankings work, privacy, terms, dispute): one column of plain text. */
export function Prose({ className, ...props }: React.ComponentProps<"article">) {
  return (
    <article
      className={cn(
        "flex flex-col gap-4 text-base",
        "[&_h1]:text-3xl [&_h1]:font-extrabold sm:[&_h1]:text-4xl",
        "[&_h2]:mt-3 [&_h2]:text-xl [&_h2]:font-bold",
        "[&_p]:max-w-prose",
        "[&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-brand-ink",
        "[&_ul]:flex [&_ul]:max-w-prose [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_th]:py-2 [&_th]:pr-3 [&_th]:text-left [&_th]:font-medium [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_tr]:border-b",
        className,
      )}
      {...props}
    />
  );
}
