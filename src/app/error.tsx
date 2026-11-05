"use client";

import { LogoMark } from "@/components/brand/Logo";
import { Main } from "@/components/layout/Page";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Main width="narrow" className="items-center justify-center py-16 text-center">
      <LogoMark size={48} className="text-brand" />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">Something went wrong</h1>
        <p className="text-muted-foreground">
          Nothing you did; the page could not be shown. Try again, or come back in a moment.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <ButtonLink variant="outline" href="/">
          Back to the start
        </ButtonLink>
      </div>
    </Main>
  );
}
