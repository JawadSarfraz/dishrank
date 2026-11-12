// The one shape for every "this is not the page you wanted" screen (docs/12-DESIGN.md): the 404,
// the error page, Forbidden, Offline and the last-resort global error. A tilted tile in the
// no-photo tile red with a white icon, the hero title, one line, and one or two actions (Primary,
// then Outline), centred in the page column. Server-safe: no hooks, so the global error page can
// use it without a layout.
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
    <Main width="narrow" className="items-center justify-center gap-6 py-16 text-center">
      <span className="flex size-[72px] -rotate-4 items-center justify-center rounded-card bg-tile-tamatar text-white shadow-float">
        {icon}
      </span>
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-display text-[28px] leading-[30px] font-extrabold tracking-[-0.015em] text-balance lg:text-[40px] lg:leading-[44px]">
          {title}
        </h1>
        <p className="max-w-prose text-base leading-[23px] text-pretty text-muted-foreground">
          {text}
        </p>
      </div>
      <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row">
        {children}
      </div>
    </Main>
  );
}
