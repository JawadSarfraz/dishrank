"use client";

// Sign out on My ratings: on phones the header has no account menu (the tab bar's Me opens this
// page), so the account's links and sign-out live here too. Same call as the desktop menu.
import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    // Better Auth's sign-out deletes the database session and clears the cookie.
    const { error } = await authClient.signOut();
    setPending(false);
    if (error) {
      toast.add({ type: "error", title: "Sign-out did not finish. Try again." });
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" onClick={signOut} disabled={pending} className="w-fit">
      <LogOutIcon aria-hidden="true" /> {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
