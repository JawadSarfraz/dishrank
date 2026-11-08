"use client";

// The last resort (Next.js global-error): when the root layout itself fails, for example the header
// throwing, this replaces Next's own black "This page couldn't load" screen. It inherits no layout,
// so it brings the fonts, the styles and its own <html> and <body>. Reload, not React's reset: a
// crash in the layout usually comes from state a reset would keep.
import { LogoMark } from "@/components/brand/Logo";
import { ProblemPage } from "@/components/layout/ProblemPage";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { htmlClassName } from "./fonts";
import "./globals.css";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en" className={htmlClassName}>
      <body className="flex min-h-full flex-col">
        <ProblemPage
          icon={<LogoMark size={32} />}
          title="Something went wrong"
          text="Nothing you did; the page could not be shown. Reload the page, or start again from the front."
        >
          <Button type="button" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <ButtonLink variant="outline" href="/">
            Back to the start
          </ButtonLink>
          {error.digest && <span className="sr-only">Error {error.digest}</span>}
        </ProblemPage>
      </body>
    </html>
  );
}
