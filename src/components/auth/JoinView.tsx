// What /join/<token> and /join/welcome show (docs/07 §7a): a link that can't be used, the panel
// member's welcome, or the invitation itself.
import { JoinPanel } from "@/components/auth/JoinPanel";
import { Main } from "@/components/layout/Page";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { BRAND } from "@/lib/brand";
import { RATE_LIMITS } from "@/server/rate-limit";
import type { getJoinPageState } from "@/server/services/panel-invite.service";
import { TRUST } from "@/server/services/ranking.constants";

export function JoinView({
  view,
  token,
  next,
  googleEnabled,
}: {
  view: Exclude<Awaited<ReturnType<typeof getJoinPageState>>, { kind: "member" }>;
  token: string | null;
  /** Already checked (safeNextPath): where to go on, whether or not the link could be used. */
  next: string | null;
  googleEnabled: boolean;
}) {
  if (view.kind === "closed" || !token) {
    return (
      <Main width="narrow" className="justify-center py-12">
        <h1 className="sr-only">Join the panel</h1>
        <EmptyState
          title="This invite link can't be used"
          text={view.kind === "closed" ? view.message : undefined}
          action={{ href: next ?? "/", label: next ? "Go on" : `Go to ${BRAND.name}` }}
        />
      </Main>
    );
  }

  return (
    <Main width="narrow" className="justify-center gap-5 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Join the {BRAND.name} panel</h1>
        <p className="max-w-prose text-muted-foreground">
          The panel is the group of early raters who get the first rankings going.
        </p>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        <li>
          Your ratings count {TRUST.panel} times, and you can rate up to{" "}
          {RATE_LIMITS.ratingPanel.limit} dishes a day.
        </li>
        <li>Only rate places where you&apos;ve really had the dish, and say what you think.</li>
        <li>You can&apos;t rate a restaurant you own or work for.</li>
      </ul>
      {googleEnabled || view.signedInAs ? (
        <JoinPanel token={token} signedInAs={view.signedInAs} next={next} />
      ) : (
        <p role="alert">Google sign-in is not configured yet.</p>
      )}
    </Main>
  );
}

/** The welcome once someone is on the panel. */
export function PanelWelcome() {
  return (
    <Main width="narrow" className="justify-center gap-4 py-12">
      <h1 className="text-3xl font-extrabold sm:text-4xl">You&apos;re on the panel</h1>
      <p className="max-w-prose text-muted-foreground">
        Thank you. Rate the dishes you&apos;ve really eaten, one place at a time. The first rankings
        start from ratings like yours.
      </p>
      <ButtonLink href="/rate" className="self-start">
        Rate a dish
      </ButtonLink>
    </Main>
  );
}
