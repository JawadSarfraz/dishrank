import { LockIcon } from "lucide-react";
import { ProblemPage } from "@/components/layout/ProblemPage";
import { ButtonLink } from "@/components/ui/button-link";

/** Shown to signed-in users without the role. The admin/owner layouts set noindex for these routes. */
export function Forbidden() {
  return (
    <ProblemPage
      icon={<LockIcon aria-hidden="true" className="size-8" />}
      title="Forbidden"
      text="You don't have access to this page."
    >
      <ButtonLink href="/">Back to the start</ButtonLink>
    </ProblemPage>
  );
}
