import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/SignInButton";
import { Wordmark } from "@/components/brand/Logo";
import { Main } from "@/components/layout/Page";
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
    <Main width="narrow" className="justify-center gap-6 py-12">
      <div className="flex flex-col items-start gap-4">
        <Wordmark size="lg" />
        <h1 className="text-3xl font-extrabold sm:text-4xl">Sign in</h1>
        <p className="max-w-prose text-muted-foreground">
          One tap with your Google account. It keeps one rating per person per dish; your e-mail
          address is never shown on {BRAND.name}.
        </p>
      </div>
      {problem && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-card px-4 py-3 text-sm"
        >
          {problem}
        </p>
      )}
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-card">
        {googleSignInEnabled ? (
          <SignInButton callbackURL={callbackURL} className="w-full" />
        ) : (
          <p role="alert">Google sign-in is not configured yet.</p>
        )}
        <p className="text-xs text-muted-foreground">
          By signing in you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2">
            terms
          </Link>
          . What we keep and why:{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy
          </Link>
          .
        </p>
      </div>
    </Main>
  );
}
