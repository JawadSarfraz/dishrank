import Link from "next/link";
import { Wordmark } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";

const LINKS = [
  { href: "/how-rankings-work", label: "How rankings work" },
  { href: "/dispute", label: "Dispute a listing" },
  { href: "/about", label: "About" },
  { href: "/about/data", label: "Data sources" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-card">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <Wordmark size="sm" />
          <div className="flex flex-col gap-0.5 sm:items-end sm:text-right">
            <p className="font-display text-base font-bold tracking-tight">{BRAND.tagline}</p>
            <p className="text-sm text-muted-foreground">{BRAND.taglineEnglish}</p>
          </div>
        </div>
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-6 sm:flex sm:flex-wrap sm:gap-x-6"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">
          Scores are diners&apos; opinions, not facts about a restaurant. Something wrong?{" "}
          <Link href="/dispute" className="underline underline-offset-2">
            Tell us
          </Link>
          .
        </p>
      </div>
    </footer>
  );
}
