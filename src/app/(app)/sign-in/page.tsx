import type { Metadata } from "next";
import { SignInButton } from "@/components/auth/SignInButton";
import { googleSignInEnabled } from "@/server/auth";
import { safeCallbackPath } from "@/server/roles";

export const metadata: Metadata = { title: "Sign in · DishRank", robots: { index: false } };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { callbackUrl } = await searchParams;
  const callbackURL = safeCallbackPath(callbackUrl);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold">Sign in</h1>
      {googleSignInEnabled ? (
        <SignInButton callbackURL={callbackURL} />
      ) : (
        <p role="alert">Google sign-in is not configured yet.</p>
      )}
    </main>
  );
}
