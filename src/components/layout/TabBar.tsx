"use client";

// The phone tab bar (spec §4, below 1024 px): Home, Search, Rate, Me, fixed to the bottom with the
// iPhone home-indicator inset. Rate is always emphasised. Search opens the city's dish search. Me
// opens My ratings when signed in and sign-in (back to My ratings) when not. The bar steps aside in
// rate mode (the rating action bar takes its place, body[data-rate-mode]) and while a text field
// has the keyboard open (body[data-keyboard]); both rules live in globals.css.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "cn";
import { authClient } from "@/lib/auth-client";
import { SEARCH_ANCHOR, cityOfPath } from "@/lib/cities";

const TYPING = /^(?:text|search|email|tel|url|number|password)$/;

function isTypingField(el: EventTarget | null) {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && TYPING.test(el.type);
}

export function TabBar() {
  const pathname = usePathname();
  const { data } = authClient.useSession();
  const city = cityOfPath(pathname);

  // On a touch screen a focused text field means the keyboard is up: hide the bar meanwhile.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const on = (e: FocusEvent) => {
      if (isTypingField(e.target)) document.body.dataset.keyboard = "";
    };
    const off = () => {
      delete document.body.dataset.keyboard;
    };
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => {
      document.removeEventListener("focusin", on);
      document.removeEventListener("focusout", off);
      off();
    };
  }, []);

  const home = pathname === "/" || pathname === `/${city}`;
  const me = pathname === "/me" || pathname === "/sign-in";
  const rate = pathname === "/rate";
  const meHref = data ? "/me" : "/sign-in?callbackUrl=%2Fme";
  const searchHref = pathname === "/" ? `/#${SEARCH_ANCHOR}` : `/${city}#${SEARCH_ANCHOR}`;

  return (
    <nav
      aria-label="Tabs"
      data-tabbar=""
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-card px-2 pt-1.5 pb-[calc(8px+env(safe-area-inset-bottom,0px))] pl-[max(8px,env(safe-area-inset-left,0px))] pr-[max(8px,env(safe-area-inset-right,0px))] lg:hidden"
    >
      <Tab href="/" label="Home" active={home}>
        <path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
      </Tab>
      <Tab href={searchHref} label="Search" active={false}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </Tab>
      <Link
        href={city === "islamabad" ? "/rate" : `/rate?city=${city}`}
        aria-current={rate ? "page" : undefined}
        className="flex h-[54px] flex-col items-center justify-center gap-[3px] text-xs leading-[14px] font-bold text-ink"
      >
        <span className="flex h-8 w-12 items-center justify-center rounded-full bg-brand">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="#fff"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
          </svg>
        </span>
        Rate
      </Link>
      <Tab href={meHref} label="Me" active={me}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </Tab>
    </nav>
  );
}

function Tab({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[54px] flex-col items-center justify-center gap-[3px] text-xs leading-[14px]",
        active ? "font-bold text-brand" : "font-semibold text-muted-foreground",
      )}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
      {label}
    </Link>
  );
}
