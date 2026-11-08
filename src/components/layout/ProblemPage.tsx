// The one shape for every "this is not the page you wanted" screen (docs/12-DESIGN.md): the 404,
// the error page, Forbidden, Offline and the last-resort global error. An icon in a brand-soft
// disc, a title, one line, and one or two actions, centred in the page column like an EmptyState.
// Server-safe: no hooks, so the global error page can use it without a layout.
import { Main } from "@/components/layout/Page";

export function ProblemPage({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  /** The actions: a ButtonLink or two, or a Button. */
  children: React.ReactNode;
}) {
  return (
    <Main width="narrow" className="items-center justify-center py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand">
        {icon}
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold text-balance sm:text-4xl">{title}</h1>
        <p className="max-w-prose text-base text-pretty text-muted-foreground">{text}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </Main>
  );
}
