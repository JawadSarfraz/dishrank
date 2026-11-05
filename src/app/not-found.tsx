import { LogoMark } from "@/components/brand/Logo";
import { Main } from "@/components/layout/Page";
import { ButtonLink } from "@/components/ui/button-link";

export default function NotFound() {
  return (
    <Main width="narrow" className="items-center justify-center py-16 text-center">
      <LogoMark size={48} className="text-brand" />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">This page is not on the menu</h1>
        <p className="text-muted-foreground">
          The link may be old, or the restaurant moved. Start from a city or rate a dish.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <ButtonLink href="/">Back to the start</ButtonLink>
        <ButtonLink variant="outline" href="/rate">
          Rate a dish
        </ButtonLink>
      </div>
    </Main>
  );
}
