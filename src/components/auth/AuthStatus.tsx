"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { SignInButton } from "./SignInButton";

/** Client-side so the home page itself stays static (ISR). */
export function AuthStatus() {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();

  if (isPending) return <p className="text-sm text-neutral-500">Checking sign-in…</p>;
  if (!data) return <SignInButton />;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p>
        Signed in as <span className="font-medium">{data.user.email}</span>
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-11 px-5"
        onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.refresh() } })}
      >
        Sign out
      </Button>
    </div>
  );
}
