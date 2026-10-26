import type { Metadata } from "next";
import { SignInButton } from "@/components/auth/SignInButton";
import { googleSignInEnabled } from "@/server/auth";
import { safeCallbackPath } from "@/server/roles";

export const metadata: Metadata = { title: "Sign in · DishRank", robots: { index: false } };

/** Fixed texts for the error codes Better Auth sends back; the URL's own text is never shown. */
function errorText(code: string | string[] | undefined): string | null {
  if (!code) return null;
  if (code === "BETA_INVITE_ONLY") {
    return "DishRank is a private beta and this Google account is not invited yet. Ask the DishRank team to add it, then try again.";
  }
  return "Sign-in did not finish. Please try again.";
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { callbackUrl, error } = await searchParams;
  const callbackURL = safeCallbackPath(callbackUrl);
  const problem = errorText(error);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold">Sign in</h1>
      {problem && (
        <p role="alert" className="rounded-lg border px-3 py-2 text-sm">
          {problem}
        </p>
      )}
      {googleSignInEnabled ? (
        <SignInButton callbackURL={callbackURL} />
      ) : (
        <p role="alert">Google sign-in is not configured yet.</p>
      )}
    </main>
  );
}
