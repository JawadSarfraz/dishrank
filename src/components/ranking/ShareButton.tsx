"use client";

// Share a page with the phone's share sheet (Web Share), or copy the link where that is missing.
// The text reads well as a WhatsApp message; the link is added after it.
import { Share2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { withShareTag } from "@/lib/source-tag";
import { trackEvent } from "@/lib/track";

export function ShareButton({
  city,
  dish,
  title,
  text,
  path,
  label = "Share this list",
  variant = "outline",
  className,
}: {
  /** Counted with the click: the city and dish slugs, nothing else. */
  city: string;
  dish: string;
  title: string;
  text: string;
  path: string;
  label?: string;
  variant?: "outline" | "secondary" | "default";
  className?: string;
}) {
  async function share() {
    trackEvent({ name: "share_click", city, dish });
    // The link carries s=share (docs/01 D1b), so visits it brings are counted as shares.
    const url = withShareTag(new URL(path, window.location.origin)).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return; // the diner closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast.add({ type: "success", title: "Link copied", description: "Paste it in a chat." });
    } catch {
      toast.add({ type: "info", title: "Copy this link", description: url, timeout: 15_000 });
    }
  }

  return (
    <Button type="button" variant={variant} onClick={share} className={className}>
      <Share2Icon aria-hidden="true" /> {label}
    </Button>
  );
}
