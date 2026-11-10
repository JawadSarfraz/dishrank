"use client";

// The admin sections: a sidebar from 1024 px up, a scrolling row of pills on smaller screens.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const SECTIONS = [
  ["/admin", "Overview"],
  ["/admin/import", "Import"],
  ["/admin/review", "Review queue"],
  ["/admin/menus", "Menus"],
  ["/admin/restaurants", "Restaurants"],
  ["/admin/contenders", "Contenders"],
  ["/admin/users", "Users"],
  ["/admin/rankings", "Rankings"],
  ["/admin/analytics", "Analytics"],
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  return (
    <nav
      aria-label="Admin"
      className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:w-48 lg:shrink-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {SECTIONS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors",
            isActive(href) ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
