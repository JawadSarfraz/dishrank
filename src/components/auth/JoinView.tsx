// What /join/<token> and /join/welcome show (docs/07 §7a): a link that can't be used, the panel
// member's welcome, or the invitation itself.
import { CheckIcon, StarIcon, UsersIcon } from "lucide-react";
import { JoinPanel } from "@/components/auth/JoinPanel";
import { Main } from "@/components/layout/Page";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { BRAND } from "@/lib/brand";
import { RATE_LIMITS } from "@/server/rate-limit";
import type { getJoinPageState } from "@/server/services/panel-invite.service";

const heroTitle =
  "font-display text-[28px] leading-[30px] font-extrabold tracking-[-0.015em] lg:text-[34px] lg:leading-[38px]";

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
          icon={<UsersIcon aria-hidden="true" className="size-6" />}
          title="This invite link can't be used"
          text={view.kind === "closed" ? view.message : undefined}
          action={{ href: next ?? "/", label: next ? "Go on" : `Go to ${BRAND.name}` }}
        />
      </Main>
    );
  }

  return (
    <Main width="narrow" className="justify-center gap-6 py-10">
      <div className="flex flex-col items-start gap-3">
        <span className="flex size-[60px] -rotate-6 items-center justify-center rounded-full bg-brand text-white shadow-sticker">
          <UsersIcon aria-hidden="true" className="size-7" />
        </span>
        <h1 className={heroTitle}>Join the {BRAND.name} panel</h1>
        <p className="max-w-prose text-base leading-[23px] text-muted-foreground">
          The panel is the group of early raters who get the first rankings going.
        </p>
      </div>
      <ul className="flex flex-col gap-3 rounded-block bg-blush p-4 text-[15px] leading-[22px]">
        {[
          <>
            Your ratings count like any regular rater&apos;s and are never held as a new
            account&apos;s; you can rate up to {RATE_LIMITS.ratingPanel.limit} dishes a day.
          </>,
          <>Only rate places where you&apos;ve really had the dish, and say what you think.</>,
          <>You can&apos;t rate a restaurant you own or work for.</>,
        ].map((line, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-white"
            >
              <CheckIcon className="size-3.5" strokeWidth={3} />
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {googleEnabled || view.signedInAs ? (
        <JoinPanel token={token} signedInAs={view.signedInAs} next={next} />
      ) : (
        <p role="alert" className="text-[15px] font-semibold">
          Google sign-in is not configured yet.
        </p>
      )}
    </Main>
  );
}

/** The welcome once someone is on the panel. */
export function PanelWelcome() {
  return (
    <Main width="narrow" className="justify-center gap-5 py-10">
      <span className="flex size-[60px] -rotate-6 items-center justify-center rounded-full bg-success text-white">
        <CheckIcon aria-hidden="true" className="size-8" strokeWidth={3} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className={heroTitle}>You&apos;re on the panel</h1>
        <p className="max-w-prose text-base leading-[23px] text-muted-foreground">
          Thank you. Rate the dishes you&apos;ve really eaten, one place at a time. The first
          rankings start from ratings like yours.
        </p>
      </div>
      <ButtonLink href="/rate" size="lg" className="w-full sm:w-fit">
        <StarIcon aria-hidden="true" className="fill-current" />
        Rate a dish
      </ButtonLink>
    </Main>
  );
}
