import { LogoMark } from "@/components/brand/Logo";
import { Main } from "@/components/layout/Page";
import { ButtonLink } from "@/components/ui/button-link";

/** Shown to signed-in users without the role. The admin/owner layouts set noindex for these routes. */
export function Forbidden() {
  return (
    <Main width="narrow" className="items-center justify-center py-16 text-center">
      <LogoMark size={48} className="text-brand" />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">Forbidden</h1>
        <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      </div>
      <ButtonLink href="/">Back to the start</ButtonLink>
    </Main>
  );
}
