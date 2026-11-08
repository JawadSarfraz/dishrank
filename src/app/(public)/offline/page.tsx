// Shown by the service worker when a page cannot be reached (public/sw.js). Static, no data.
import type { Metadata } from "next";
import { WifiOffIcon } from "lucide-react";
import { ProblemPage } from "@/components/layout/ProblemPage";
import { ButtonLink } from "@/components/ui/button-link";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Offline", robots: { index: false, follow: false } };

export default function OfflinePage() {
  return (
    <ProblemPage
      icon={<WifiOffIcon aria-hidden="true" className="size-8" />}
      title="You're offline"
      text={`${BRAND.name} needs a connection to show the rankings. Once you are back online, try again.`}
    >
      <ButtonLink href="/">Try again</ButtonLink>
    </ProblemPage>
  );
}
