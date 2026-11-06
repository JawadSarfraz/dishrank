// Where Google returns someone who signed in through a panel invite link (JOIN_WELCOME_PATH). The
// sign-in itself granted the panel (src/server/auth.ts); this only says how it went.
import type { Metadata } from "next";
import { JoinView, PanelWelcome } from "@/components/auth/JoinView";
import { getSessionUser, googleSignInEnabled } from "@/server/auth";
import { getJoinPageState } from "@/server/services/panel-invite.service";

export const metadata: Metadata = {
  title: "Join the panel",
  robots: { index: false, follow: false },
};

export default async function JoinWelcomePage() {
  const view = await getJoinPageState(await getSessionUser(), null);
  if (view.kind === "member") return <PanelWelcome />;
  return <JoinView view={view} token={null} googleEnabled={googleSignInEnabled} />;
}
