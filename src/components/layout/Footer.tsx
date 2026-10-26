import Link from "next/link";

const LINKS = [
  { href: "/how-rankings-work", label: "How rankings work" },
  { href: "/dispute", label: "Dispute" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/about/data", label: "Data sources" },
];

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-xl px-4 py-6 text-sm text-muted-foreground">
      <nav aria-label="Footer" className="flex flex-wrap gap-x-4">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center underline">
            {l.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
