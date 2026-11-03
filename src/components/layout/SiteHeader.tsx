"use client";

// The header on every page. Client-side, so public pages stay static (ISR): the session is read in
// the browser after load, and the sign-in control keeps its space meanwhile (no layout shift).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const linkClass = "inline-flex min-h-11 items-center underline-offset-2 hover:underline";

export function SiteHeader({ beta }: { beta: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, isPending } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    setSigningOut(true);
    setError(false);
    // Better Auth's sign-out deletes the database session and clears the cookie.
    const { error } = await authClient.signOut();
    setSigningOut(false);
    if (error) {
      setError(true);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <header className="mx-auto w-full max-w-xl px-4 pt-1">
      <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 text-sm">
        <Link href="/" className={`${linkClass} text-base font-bold`}>
          DishRank
        </Link>
        {beta && <span className="rounded-full border px-2 py-0.5 text-xs font-medium">Beta</span>}
        <Link href="/rate" className={linkClass}>
          Rate a dish
        </Link>
        <Link href="/me" className={linkClass}>
          My ratings
        </Link>
        <span className="ml-auto inline-flex min-w-14 justify-end">
          {isPending ? null : data ? (
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className={`${linkClass} underline disabled:opacity-50`}
            >
              Sign out
            </button>
          ) : pathname === "/sign-in" ? null : (
            <Link
              href={`/sign-in?callbackUrl=${encodeURIComponent(pathname)}`}
              className={`${linkClass} underline`}
            >
              Sign in
            </Link>
          )}
        </span>
      </nav>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Sign-out did not finish. Try again.
        </p>
      )}
    </header>
  );
}
