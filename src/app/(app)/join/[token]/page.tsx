// A panel invite link (docs/07 §7a). Dynamic and never indexed; the token is only compared by its
// hash, and no third-party request carries it (no-referrer on top of the site's own policy).
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { JoinView, PanelWelcome } from "@/components/auth/JoinView";
import { getSessionUser, googleSignInEnabled } from "@/server/auth";
import { safeNextPath } from "@/server/roles";
import { getJoinPageState } from "@/server/services/panel-invite.service";
import { panelInviteToken } from "@/server/validation";

export const metadata: Metadata = {
  title: "Join the panel",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function JoinPanelPage({ params, searchParams }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const next = safeNextPath((await searchParams).next);
  const parsed = panelInviteToken.safeParse(token);
  const valid = parsed.success ? parsed.data : null;
  const view = await getJoinPageState(await getSessionUser(), valid);
  if (view.kind === "member") {
    if (next) redirect(next);
    return <PanelWelcome />;
  }
  return <JoinView view={view} token={valid} next={next} googleEnabled={googleSignInEnabled} />;
}
