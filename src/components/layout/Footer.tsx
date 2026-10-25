import Link from "next/link";

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-xl px-4 py-6 text-sm text-muted-foreground">
      <nav aria-label="Footer" className="flex flex-wrap gap-4">
        <Link href="/about/data" className="underline">
          Data sources
        </Link>
      </nav>
    </footer>
  );
}
