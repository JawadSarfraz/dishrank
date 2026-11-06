// A panel invite link (docs/07 §7a). Dynamic and never indexed; the token is only compared by its
// hash, and no third-party request carries it (no-referrer on top of the site's own policy).
import type { Metadata } from "next";
import { Main } from "@/components/layout/Page";
import { JoinPanel } from "@/components/auth/JoinPanel";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button-link";
import { BRAND } from "@/lib/brand";
import { getSessionUser, googleSignInEnabled } from "@/server/auth";
import { RATE_LIMITS } from "@/server/rate-limit";
import { getJoinPageState } from "@/server/services/panel-invite.service";
import { TRUST } from "@/server/services/ranking.constants";
import { panelInviteToken } from "@/server/validation";

export const metadata: Metadata = {
  title: "Join the panel",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function JoinPanelPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const parsed = panelInviteToken.safeParse(token);
  const user = await getSessionUser();
  const view = await getJoinPageState(user, parsed.success ? parsed.data : null);

  if (view.kind === "closed") {
    return (
      <Main width="narrow" className="justify-center py-12">
        <h1 className="sr-only">Join the panel</h1>
        <EmptyState
          title="This invite link can't be used"
          text={`${view.message} Ask whoever sent it for a new one. You can still rate dishes on ${BRAND.name} with an ordinary account.`}
          action={{ href: "/", label: `Go to ${BRAND.name}` }}
        />
      </Main>
    );
  }

  if (view.kind === "member") {
    return (
      <Main width="narrow" className="justify-center gap-4 py-12">
        <h1 className="text-3xl font-extrabold sm:text-4xl">You&apos;re on the panel</h1>
        <p className="max-w-prose text-muted-foreground">
          Thank you. Rate the dishes you&apos;ve really eaten, one place at a time. The first
          rankings start from ratings like yours.
        </p>
        <ButtonLink href="/rate" className="self-start">
          Rate a dish
        </ButtonLink>
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
      {googleSignInEnabled || view.signedInAs ? (
        <JoinPanel token={parsed.data!} signedInAs={view.signedInAs} />
      ) : (
        <p role="alert">Google sign-in is not configured yet.</p>
      )}
    </Main>
  );
}
