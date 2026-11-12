import type { Metadata } from "next";
import { CircleAlertIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/SignInButton";
import { Wordmark } from "@/components/brand/Logo";
import { Main } from "@/components/layout/Page";
import { InlineLink, SmallPrint } from "@/components/ui/kit";
import { BRAND } from "@/lib/brand";
import { getSessionUser, googleSignInEnabled } from "@/server/auth";
import { safeCallbackPath, signedInRedirectPath } from "@/server/roles";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/** Fixed texts for the error codes Better Auth sends back; the URL's own text is never shown. */
function errorText(code: string | string[] | undefined): string | null {
  if (!code) return null;
  if (code === "BETA_INVITE_ONLY") {
    return `${BRAND.name} is a private beta and this Google account is not invited yet. Ask the ${BRAND.name} team to add it, then try again.`;
  }
  if (code === "ACCOUNT_BANNED") {
    return `This Google account was banned from ${BRAND.name}, so it cannot sign up again. If you think that is a mistake, write to the contact address on the privacy page.`;
  }
  return "Sign-in did not finish. Please try again.";
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { callbackUrl, error } = await searchParams;
  // Signed in already: straight on to where sign-in would have led (a path on this site, or home).
  if (await getSessionUser()) redirect(signedInRedirectPath(callbackUrl));
  const callbackURL = safeCallbackPath(callbackUrl);
  const problem = errorText(error);

  return (
    <Main width="narrow" className="justify-center gap-6 py-10 sm:max-w-md">
      <div className="flex flex-col items-start gap-5">
        <Wordmark size="lg" />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[28px] leading-[30px] font-extrabold tracking-[-0.015em] lg:text-[34px] lg:leading-[38px]">
            Sign in
          </h1>
          <p className="max-w-prose text-base leading-[23px] text-muted-foreground">
            One tap with your Google account. It keeps one rating per person per dish; your e-mail
            address is never shown on {BRAND.name}.
          </p>
        </div>
      </div>
      {problem && (
        <p
          role="alert"
          className="flex items-start gap-3 rounded-field border border-ink bg-card px-4 py-3 text-sm leading-5 font-semibold"
        >
          <CircleAlertIcon aria-hidden="true" className="mt-px size-5 shrink-0 text-brand" />
          <span>{problem}</span>
        </p>
      )}
      <div className="flex flex-col gap-4 rounded-block bg-blush p-4">
        {googleSignInEnabled ? (
          <SignInButton callbackURL={callbackURL} className="w-full" />
        ) : (
          <p role="alert" className="text-[15px] font-semibold">
            Google sign-in is not configured yet.
          </p>
        )}
      </div>
      <SmallPrint>
        By signing in you agree to the <InlineLink href="/terms">terms</InlineLink>. What we keep
        and why: <InlineLink href="/privacy">privacy</InlineLink>.
      </SmallPrint>
    </Main>
  );
}
