"use client";

// Shown instead of "Continue with Google" inside the Facebook, Instagram, Messenger and TikTok
// browsers, where Google refuses its sign-in. The page itself goes on in the phone's browser: on
// Android by an intent:// link to the same address, on iPhone by the app's own menu, which no link
// can reach. Either way the address keeps everything the visitor did, such as a tapped score.
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { chromeIntentUrl, escapedPageUrl, type InAppBrowser } from "@/lib/in-app-browser";
import { trackEvent } from "@/lib/track";

const APP_NAMES: Record<InAppBrowser["app"], string> = {
  facebook: "the Facebook app",
  instagram: "Instagram",
  messenger: "Messenger",
  tiktok: "TikTok",
};

export function OpenInBrowser({ browser }: { browser: InAppBrowser }) {
  // Rendered only in the browser (useInAppBrowser is null on the server).
  const [pageUrl] = useState(() => escapedPageUrl(window.location.href));
  const box = useRef<HTMLDivElement>(null);

  // Counted once it is on screen: a closed Disclosure ("Suggest a restaurant") mounts it unseen.
  useEffect(() => {
    if (!box.current) return;
    const seen = new IntersectionObserver((entries, observer) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      trackEvent({ name: "in_app_sign_in_started" });
    });
    seen.observe(box.current);
    return () => seen.disconnect();
  }, []);

  async function copyLink() {
    trackEvent({ name: "in_app_left_browser" });
    // The address now, not at render: a score tapped since then is in it.
    const url = escapedPageUrl(window.location.href);
    try {
      await navigator.clipboard.writeText(url);
      toast.add({
        type: "success",
        title: "Link copied",
        description: "Paste it in your browser to sign in.",
      });
    } catch {
      toast.add({ type: "info", title: "Copy this link", description: url, timeout: 30_000 });
    }
  }

  return (
    <div ref={box} className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
      <p>
        <span className="font-medium">
          Google sign-in doesn&apos;t work in {APP_NAMES[browser.app]}.
        </span>{" "}
        {browser.os === "ios" ? (
          <>
            Tap <strong>•••</strong> then <strong>Open in Safari</strong>, and sign in there.
          </>
        ) : browser.os === "android" ? (
          "Open this page in Chrome and sign in there."
        ) : (
          "Open this page in your browser and sign in there."
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {browser.os === "android" && (
          <a
            href={chromeIntentUrl(pageUrl)}
            className={buttonVariants({ size: "lg" })}
            onClick={(e) => {
              trackEvent({ name: "in_app_left_browser" });
              e.currentTarget.href = chromeIntentUrl(escapedPageUrl(window.location.href));
            }}
          >
            Open in Chrome
          </a>
        )}
        <Button
          type="button"
          size="lg"
          variant={browser.os === "android" ? "outline" : "default"}
          onClick={copyLink}
        >
          Copy link
        </Button>
      </div>
    </div>
  );
}
