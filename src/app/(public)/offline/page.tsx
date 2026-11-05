// Shown by the service worker when a page cannot be reached (public/sw.js). Static, no data.
import type { Metadata } from "next";
import { WifiOffIcon } from "lucide-react";
import { Main } from "@/components/layout/Page";
import { ButtonLink } from "@/components/ui/button-link";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Offline", robots: { index: false, follow: false } };

export default function OfflinePage() {
  return (
    <Main width="narrow" className="items-center justify-center py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand">
        <WifiOffIcon aria-hidden="true" className="size-7" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">You&apos;re offline</h1>
        <p className="text-muted-foreground">
          {BRAND.name} needs a connection to show the rankings. Once you are back online, try again.
        </p>
      </div>
      <ButtonLink href="/">Try again</ButtonLink>
    </Main>
  );
}
