"use client";

// Share a page with the phone's share sheet (Web Share), or, where that is missing, copy the link
// or open WhatsApp with the text (wa.me). The text reads well as a WhatsApp message; the link is
// added after it, tagged s=share (docs/01 D1b). Three looks: a full-width button, the Primary
// "Share on WhatsApp" (success screen), or a 44 px round icon on a photo or tile header. With
// `statusImage`, a small link under the button opens the 1080 × 1920 WhatsApp status card.
import { Share2Icon } from "lucide-react";
import { cn } from "cn";
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
  appearance = "button",
  fallback = "copy",
  statusImage,
  className,
}: {
  /** Counted with the click: the city and dish slugs, nothing else (a page with no dish, such as
   * a restaurant page, is not counted: the event names a dish list). */
  city: string;
  dish?: string;
  title: string;
  text: string;
  path: string;
  label?: string;
  variant?: "outline" | "secondary" | "default" | "cta";
  /** "round": a 44 px white circle with the share icon (label read by screen readers only). */
  appearance?: "button" | "round";
  /** Without Web Share: copy the link, or open WhatsApp with the text and link. */
  fallback?: "copy" | "whatsapp";
  /** The status card's path (statusImagePath), offered as a link under the button. */
  statusImage?: string;
  className?: string;
}) {
  async function share() {
    if (dish) trackEvent({ name: "share_click", city, dish });
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
    if (fallback === "whatsapp") {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
        "_blank",
        "noopener",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast.add({ type: "success", title: "Link copied", description: "Paste it in a chat." });
    } catch {
      toast.add({ type: "info", title: "Copy this link", description: url, timeout: 15_000 });
    }
  }

  if (appearance === "round") {
    return (
      <Button
        type="button"
        variant="round"
        size="icon"
        onClick={share}
        aria-label={label}
        className={cn("shadow-float", className)}
      >
        <Share2Icon aria-hidden="true" />
      </Button>
    );
  }

  const button = (
    <Button
      type="button"
      variant={variant}
      size={variant === "cta" ? "xl" : "lg"}
      onClick={share}
      className={cn(!statusImage && className)}
    >
      <Share2Icon aria-hidden="true" /> {label}
    </Button>
  );
  if (!statusImage) return button;
  return (
    <div className={cn("flex flex-col items-stretch gap-1", className)}>
      {button}
      <a
        href={statusImage}
        target="_blank"
        rel="noopener"
        className="inline-flex min-h-11 items-center justify-center text-sm font-bold text-ink underline underline-offset-4 hover:text-brand-press"
      >
        Get the WhatsApp status image
      </a>
    </div>
  );
}
