"use client";

// The header on every page. Client-side, so public pages stay static (ISR): the session is read in
// the browser after load, and the account control keeps its space meanwhile (no layout shift).
// Signed in: a small account menu with My ratings, the Owner and Admin areas for those roles, and
// Sign out (owner, Part 3). The role only picks which links show; every page checks it again.
import { LogOutIcon, ShieldIcon, StarIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { BRAND } from "@/lib/brand";
import { ButtonLink } from "@/components/ui/button-link";

export function SiteHeader({ beta }: { beta: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, isPending } = authClient.useSession();
  const role = (data?.user as { role?: string } | undefined)?.role;
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    // Better Auth's sign-out deletes the database session and clears the cookie.
    const { error } = await authClient.signOut();
    setSigningOut(false);
    if (error) {
      toast.add({ type: "error", title: "Sign-out did not finish. Try again." });
      return;
    }
    router.push("/");
    router.refresh();
  }

  const initial = (data?.user.name?.trim()[0] ?? data?.user.email[0] ?? "?").toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4 sm:px-6"
      >
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 items-center rounded-lg px-1"
          aria-label={beta ? `${BRAND.name} Beta, home` : `${BRAND.name} home`}
        >
          <Wordmark tag={beta ? "Beta" : undefined} />
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          {pathname !== "/rate" && (
            <ButtonLink href="/rate" size="sm" className="h-11 px-3.5 text-base">
              Rate<span className="hidden min-[430px]:inline"> a dish</span>
            </ButtonLink>
          )}
          <span className="inline-flex min-w-11 justify-end">
            {isPending ? null : data ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Account menu"
                      className="rounded-full font-display text-lg font-bold text-brand"
                    />
                  }
                >
                  {initial}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8}>
                  <DropdownMenuLabel className="truncate px-2.5 pt-1.5 pb-1 text-sm">
                    {data.user.name || data.user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuLinkItem render={<Link href="/me" />}>
                    <StarIcon /> My ratings
                  </DropdownMenuLinkItem>
                  {role === "OWNER" && (
                    <DropdownMenuLinkItem render={<Link href="/owner" />}>
                      <StoreIcon /> Owner
                    </DropdownMenuLinkItem>
                  )}
                  {role === "ADMIN" && (
                    <DropdownMenuLinkItem render={<Link href="/admin" />}>
                      <ShieldIcon /> Admin
                    </DropdownMenuLinkItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} disabled={signingOut}>
                    <LogOutIcon /> {signingOut ? "Signing out…" : "Sign out"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : pathname === "/sign-in" ? null : (
              <ButtonLink
                variant="ghost"
                size="sm"
                className="h-11 px-2.5 text-base"
                href={`/sign-in?callbackUrl=${encodeURIComponent(pathname)}`}
              >
                Sign in
              </ButtonLink>
            )}
          </span>
        </div>
      </nav>
    </header>
  );
}
