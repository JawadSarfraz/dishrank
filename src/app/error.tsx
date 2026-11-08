"use client";

import { CircleAlertIcon } from "lucide-react";
import { ProblemPage } from "@/components/layout/ProblemPage";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ProblemPage
      icon={<CircleAlertIcon aria-hidden="true" className="size-8" />}
      title="Something went wrong"
      text="Nothing you did; the page could not be shown. Try again, or come back in a moment."
    >
      <Button type="button" onClick={reset}>
        Try again
      </Button>
      <ButtonLink variant="outline" href="/">
        Back to the start
      </ButtonLink>
    </ProblemPage>
  );
}
