"use client";

// The header on every page (spec §4, Top bar). Client-side, so public pages stay static (ISR): the
// session is read in the browser after load, and the account control keeps its space meanwhile.
// Phones (below 1024 px): 64 px, the logo and "How it works"; not sticky. Rate, Search and Me are
// in the tab bar (TabBar.tsx), and the account links live on My ratings. Desktop: one row, at most
// 1240 px wide: logo, "Dishes", "How rankings work", then the city switch, the dish search, "Rate a
// dish" and Sign in or the account menu (My ratings, Owner and Admin for those roles, Sign out).
// The role only picks which links show; every page checks it again.
import { LogOutIcon, ShieldIcon, StarIcon, StoreIcon } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { cn } from "cn";
import { Wordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { BRAND } from "@/lib/brand";
import { CITIES, cityOfPath } from "@/lib/cities";
import { ButtonLink } from "@/components/ui/button-link";

// The desktop search loads only on a desktop screen: phones never download it for the header.
const DishSearch = dynamic(
  () => import("@/components/ranking/DishSearch").then((m) => m.DishSearch),
  { ssr: false },
);
const DESKTOP = "(min-width: 1024px)";
const subscribeDesktop = (change: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const isDesktop = () => window.matchMedia(DESKTOP).matches;

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
  const city = cityOfPath(pathname);
  const cityName = CITIES.find((c) => c.slug === city)?.name ?? city;
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => false);
  const onCityHome = pathname === "/" || CITIES.some((c) => pathname === `/${c.slug}`);

  return (
    <header className="border-b bg-background pt-[env(safe-area-inset-top,0px)] lg:border-line">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-4 pr-[max(16px,env(safe-area-inset-right,0px))] pl-[max(16px,env(safe-area-inset-left,0px))] lg:h-[72px] lg:gap-6 lg:px-8"
      >
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 shrink-0 items-center rounded-lg px-1"
          aria-label={beta ? `${BRAND.name} Beta, home` : `${BRAND.name} home`}
        >
          <Wordmark tag={beta ? "Beta" : undefined} />
        </Link>

        {/* Phones: one link. */}
        <Link
          href="/how-rankings-work"
          className="ml-auto inline-flex min-h-11 items-center text-sm font-semibold text-ink underline underline-offset-[3px] hover:text-brand-press lg:hidden"
        >
          How it works
        </Link>

        {/* Desktop: the full row. */}
        <div className="hidden items-center gap-1 lg:flex">
          <Link
            href={`/${city}#dishes`}
            className="inline-flex min-h-11 items-center rounded-control px-3 text-[15px] font-semibold text-ink hover:bg-sand"
          >
            Dishes
          </Link>
          <Link
            href="/how-rankings-work"
            className="inline-flex min-h-11 items-center rounded-control px-3 text-[15px] font-semibold text-ink hover:bg-sand"
          >
            How rankings work
          </Link>
        </div>
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <div
            role="group"
            aria-label="City"
            className="grid grid-cols-2 gap-1 rounded-button bg-sand p-1"
          >
            {CITIES.map((c) => {
              const active = c.slug === city;
              return (
                <Link
                  key={c.slug}
                  href={`/${c.slug}`}
                  aria-current={active && onCityHome ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 items-center justify-center rounded-control px-4 text-[15px]",
                    active
                      ? "bg-ink font-bold text-white"
                      : "font-semibold text-ink hover:bg-white",
                  )}
                >
                  {c.name}
                </Link>
              );
            })}
          </div>
          <div className="w-[210px]">
            {desktop && <DishSearch citySlug={city} cityName={cityName} popover />}
          </div>
          {pathname !== "/rate" && (
            <ButtonLink href={city === "islamabad" ? "/rate" : `/rate?city=${city}`}>
              <StarIcon aria-hidden="true" className="fill-current" />
              Rate a dish
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
                      className="rounded-full font-display text-lg font-extrabold text-brand"
                    />
                  }
                >
                  {initial}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8}>
                  {/* The name labels a group: Base UI's GroupLabel throws outside one (2026-11-08). */}
                  <DropdownMenuGroup>
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
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} disabled={signingOut}>
                    <LogOutIcon /> {signingOut ? "Signing out…" : "Sign out"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : pathname === "/sign-in" || pathname.startsWith("/join/") ? null : (
              <Link
                href={`/sign-in?callbackUrl=${encodeURIComponent(pathname)}`}
                className="inline-flex min-h-11 items-center px-2 text-[15px] font-bold text-ink underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            )}
          </span>
        </div>
      </nav>
    </header>
  );
}
